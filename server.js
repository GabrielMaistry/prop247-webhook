const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON payloads
app.use(express.json());

// This MUST match the Verify Token in your Meta Developer Dashboard
const VERIFY_TOKEN = "prop247_secret_123";

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

app.post('/webhook', (req, res) => {
    const body = req.body;

    // Check if this is a WhatsApp message event
    if (body.object === 'whatsapp_business_account') {
        if (
            body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            // EXTRACT THE DATA
            const message = body.entry[0].changes[0].value.messages[0];
            const contact = body.entry[0].changes[0].value.contacts[0];

            const fromNumber = message.from; // The lead's phone number
            const leadName = contact.profile.name; // The lead's WhatsApp name
            const messageText = message.text ? message.text.body : "[Not a text message]"; // The message body

            // Log the clean data
            console.log("====================================");
            console.log("📥 NEW LEAD RECEIVED!");
            console.log(`👤 Name: ${leadName}`);
            console.log(`📱 Phone: ${fromNumber}`);
            console.log(`💬 Message: ${messageText}`);
            console.log("====================================");
        }
    }

    // Always respond with 200 OK to Meta
    res.sendStatus(200);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Webhook server listening on port ${PORT}`);
});

const SUPABASE_URL = 'https://byzuikkzzehjxpgnsddz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Unp2ba5pU-mJ1yJHR02IkA_XrDjIygW';
