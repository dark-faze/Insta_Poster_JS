const express = require("express");
const app = express();
const Instagram = require("instagram-web-api");
const fs = require("fs")
const cron = require("node-cron")
const imaps = require("imap-simple")
const _ = require("lodash")
const simpleParser = require("mailparser").simpleParser
require("dotenv").config();

var instaCaption = `
Your caption goes here.
`

const port = process.env.PORT || 4801;

//  cron.schedule("0 */4 * * *", async () => {
  // Every 4 hour Cron Job
  cron.schedule("* * * * *", async () => {  
  // Every Minute Cron Job

  const instagramLoginFunction = async () => {
    const client = new Instagram({
      username: process.env.ID_INSTA,
      password: process.env.PASS_INSTA,
    }, {
      language: "en-US"
    });

    const instagramPostPictureFunction = async () => {
      // await client
      // .getPhotosByUsername ({ username: "fluff.n.paws" })
      // .then((res) => console.log(res.user.res.user.edge_owner_to_timeline_media.edges));

      const file = fs.readdirSync("./Images")[0]

      await client.uploadPhoto({
        photo: `./Images/${file}`,
        caption: instaCaption,
        post: "feed"
      })
        .then(() => {
          console.log(`${file} uploaded`)
          fs.unlinkSync(`./Images/${file}`)
        })
        .catch((err) => console.log(err))
    };

    try {
      console.log("Logging in")
      await client.login();
      console.log("Logged in")
      await instagramPostPictureFunction();

    } catch (err) {
      console.log("Login Failed" + err)

      if(err.status === 403) {
        console.log("-------------------Throttled--------------------")
        return;
      }

      if(err.error && err.error.message === "checkpoint_required"){
        console.log("CheckPoint Hit")
        const challengeUrl = err.error.checkpoint_url;
        await client.updateChallenge({challengeUrl, choice: 1});

        const emailConfig = {
          imap: {
            user: `${process.env.ID_MAIL}`,
            password: `${process.env.PASS_INSTA}`,
            host: "imap.gmail.com",
            port: 993,
            tls: true,
            tlsOptions: {
              servername: "imap.gmail.com",
              rejectUnauthorized: "false"
            },
            authTimeout: 30000
          }
        }
        
        const delayedEmailFunction = async (timeout) => {
        setTimeout(() => {
        imaps.connect(emailConfig).then((connection) => {
            return connection.openBox("INBOX").then(()=>{
              const delay = 1 * 3600 * 1000;
              let lastHour = new Date()
              lastHour.setTime(Date.now() - delay);
              lastHour = lastHour.toISOString;
              const searchCriteria = ["ALL","SINCE", lastHour];
              const fetchOptions = {
                bodies: [""],
              };
              return connection.search(searchCriteria, fetchOptions).then((messages) => {
                messages.forEach((item)=>{
                    const all = _.find(item.parts, {which: ""});
                    const id = item.attributes.uid;
                    const idHeader = "Imap-Id: " + id + "\r\n";

                    simpleParser(idHeader + all.body, async (err, mail) => {
                        if(err){
                          console.log("Simple Parser" + err)
                        }

                        console.log(mail.subject);

                        const answerCodeArr = mail.text
                        .split("\n")
                        .filter((item) => item && /^\S+$/.test(item) && !isNaN(item));

                        if(mail.text.includes("Instagram")) {
                          if(answerCodeArr.length > 0) {
                            const answerCode = answerCodeArr[0];
                            console.log(answerCode)

                            await client.updateChallenge({
                              challengeUrl,
                              securityCode: answerCode
                            })

                            console.log("Answered Insta Securitty Challenge")

                            await client.login();
                            await instagramPostPictureFunction();
                          }
                        }
                    })
                })
              })
            })
        })
      }, timeout)
      }

      await delayedEmailFunction(45000);     
    }
   }
  }

 await instagramLoginFunction();

 });

app.get('/', (req, res) => {
  res.send("InstaPoster Running");
})
app.listen(port, () => {
  console.log(` Listening on port ${port}... `);
});