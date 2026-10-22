const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON payloads
app.use(express.json());

// This MUST match the Verify Token in your Meta Developer Dashboard
const VERIFY_TOKEN = "prop247_secret_123";

// Setup Supabase Connection
const SUPABASE_URL = 'https://byzuikkzzehjxpgnsddz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5enVpa2t6emVoanhwZ25zZGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjI3NzAsImV4cCI6MjEwODIzODc3MH0.5Ysvj3DzuR7QL9FFcwIuC__Eq5UD2QhPE5ZQBI1v7uY'; // Make sure this is the full key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        if (
            body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            const message = body.entry[0].changes[0].value.messages[0];
            const contact = body.entry[0].changes[0].value.contacts[0];

            const fromNumber = message.from;
            const leadName = contact.profile.name;
            const messageText = message.text ? message.text.body : "[Not a text message]";

            console.log("====================================");
            console.log("📥 NEW LEAD RECEIVED!");
            console.log(`👤 Name: ${leadName}`);
            console.log(`📱 Phone: ${fromNumber}`);
            console.log(`💬 Message: ${messageText}`);
            console.log("====================================");

            // 💾 SAVE TO SUPABASE
            const { data, error } = await supabase
                .from('leads')
                .insert([
                    { name: leadName, phone: fromNumber, message: messageText }
                ]);

            if (error) {
                console.error("❌ Error saving to Supabase:", error);
            } else {
                console.log("✅ Lead successfully saved to database!");
            }
        }
    }

    // Always respond with 200 OK to Meta
    res.sendStatus(200);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Webhook server listening on port ${PORT}`);
});
