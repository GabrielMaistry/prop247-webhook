const express = require('express');
const axios = require('axios'); 
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const VERIFY_TOKEN = "prop247_secret_123";

const SUPABASE_URL = 'https://byzuikkzzehjxpgnsddz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5enVpa2t6emVoanhwZ25zZGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjI3NzAsImV4cCI6MjEwODIzODc3MH0.5Ysvj3DzuR7QL9FFcwIuC__Eq5UD2QhPE5ZQBI1v7uY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const WHATSAPP_TOKEN = 'EAActpmZBw03kBSzVYZB4zNj5q15DsOWuo6bxQnvLqZC8LiE8cJuuvWnX9oBaZB3bRZBW4gD972YrdCoIMEgzOx9zkOBrFeNJx2xP6ZCRT0e8ZCzjDy2g2jRUvYtZBTQmxengCFK4EHa18TtVWPs9Gx9CrMzoHU5QZBf6LNQZBVIYXNA6ehW1kja67T3xwiojj525peB49DcjEeqHgid9ui1wpyKJe5ojuJqJjj23XC'; 
const PHONE_NUMBER_ID = '1472307879292652';
const AGENT_PHONE_NUMBER = '27637662817'; 

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

app.post('/webhook', async (req, res) => {
    console.log("📥 WEBHOOK HIT!");

    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
                
                const message = body.entry[0].changes[0].value.messages[0];
                const contact = body.entry[0].changes[0].value.contacts[0];
                const fromNumber = message.from;
                const leadName = contact.profile.name;
                const messageText = message.text ? message.text.body : "[Media/Other]";

                console.log(`📱 From: ${leadName} (${fromNumber})`);

                let propertyId = null;
                const refMatch = messageText.match(/Ref:\s*ID-(\d+)/i);
                if (refMatch) propertyId = refMatch[1];

                // 1. SAVE TO DB
                const { error } = await supabase.from('leads').insert([
                    { name: leadName, phone: fromNumber, message: messageText, property_id: propertyId }
                ]);
                
                if (error) console.error("❌ Supabase Error:", error);
                else console.log("✅ Lead saved to DB!");

                // 2. AUTO-REPLY
                try {
                    const reply = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                        messaging_product: "whatsapp",
                        to: fromNumber,
                        text: { body: `Hi ${leadName}, this is Prop247. Thanks for your enquiry. One of our agents will be in contact with you shortly on WhatsApp.` }
                    }, {
                        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
                    });
                    console.log("✅ SUCCESS: Reply sent to buyer! Message ID:", reply.data.messages[0].id);
                } catch (err) {
                    console.error("🚨 FAILED TO SEND REPLY. ERROR FROM META:", JSON.stringify(err.response?.data || err.message, null, 2));
                }

                // 3. NOTIFY AGENT
                try {
                    const agentLink = `https://wa.me/${fromNumber}?text=Hi%20${leadName},%20I%20am%20responding%20to%20your%20enquiry.`;
                    await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                        messaging_product: "whatsapp",
                        to: AGENT_PHONE_NUMBER,
                        text: { body: `🚨 *NEW LEAD*\n\n👤 Name: ${leadName}\n📱 Phone: ${fromNumber}\n💬 Message: ${messageText}\n\n👇 Reply here:\n${agentLink}` }
                    }, {
                        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
                    });
                    console.log("✅ Agent notified!");
                } catch (err) {
                    console.error("🚨 FAILED TO NOTIFY AGENT. ERROR FROM META:", JSON.stringify(err.response?.data || err.message, null, 2));
                }
            }
        }
    } catch (error) {
        console.error("🚨 FATAL ERROR:", error);
    }
    res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
