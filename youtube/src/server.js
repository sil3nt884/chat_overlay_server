import * as  https from "https";
import express, {response} from 'express'
import bodyParser   from "body-parser";
import *  as fs from 'fs'
import {google} from 'googleapis'



const app = express();

app.use(bodyParser.json())


const oauth2Client = new google.auth.OAuth2(
    {
        clientId: "",
        clientSecret: "",
        redirectUri: "https://livenowbeta.asuscomm.com:3000/google-callback"
    }
);

// Scope for the data you want to access (e.g., profile, email)
const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly'
];

let storedToken = {}

app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
    });
    res.redirect(url);
});

function authenticateRequest(req, res, next) {
    console.log(storedToken)
    if (Object.keys(storedToken).length < 1) {
        return res.redirect("/auth/google")
    }

    oauth2Client.setCredentials(storedToken);
    req.authClient = oauth2Client;
    next();
}

app.get('/google-callback', async (req, res) => {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    storedToken = tokens;
    oauth2Client.setCredentials(tokens);
    return res.redirect("/chat")
    res.send('Authentication successful! You can close this window.');
});



app.get("/chat", authenticateRequest, async (req,res) => {
    try {
        const { nextPageToken } =req.query
        console.log("called", new Date().toISOString())

        const youtube = google.youtube({ version: 'v3', auth: req.authClient })
        const live = await youtube
            .liveBroadcasts.list({
                "part": [
                    "snippet,contentDetails,status"
                ],
                "broadcastStatus": "active",
                "broadcastType": "all"
            });

        const data = live.data
        const [id] = data.items.map(item => item.snippet.liveChatId)
        console.log(id)
        if (!id) {
            console.log("no ids found")
            return res.send("no chant ids found")
        }
        const currentChat = await youtube.liveChatMessages
            .list({
                liveChatId: id,
                part: [
                    "id",
                    "snippet",
                    "authorDetails"
                ],
                pageToken: nextPageToken ?? undefined
            })

        const currentChatData = currentChat.data
        const pageInfo = currentChatData.pageInfo
        const currentItems = currentChatData.items
            .map(({
                  id,
                  snippet,
                  authorDetails
            }) => {
                return {
                    [authorDetails.displayName]: {
                        id,
                        text: snippet.textMessageDetails.messageText
                    }
                }
            })
        const nextToken = currentChatData.nextPageToken;
        const payload ={
            liveChatItems: currentItems,
            pageInfo,
            nextPageToken: nextToken,
            hasPage: pageInfo.resultsPerPage != pageInfo.totalResults
        }

        res.set(
            'content-type', 'application/json; charset=UTF-8',
        )
        res.statusCode = 200
        return res
            .send(JSON.stringify(payload))
    }
    catch (e) {
        console.log('error', e)
        res.set(
            'content-type', 'application/json; charset=UTF-8',
        )
        res.statusCode = 500
        return res.send(JSON.stringify(e, null ,4))



    }

})


const server = https.createServer({
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
}, app)


server.listen(3000)
console.log("server started")


