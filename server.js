const express = require('express');
const axios = require('axios'); 
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const VERIFY_TOKEN = "prop247_secret_123";

// Supabase Setup
const SUPABASE_URL = 'https://byzuikkzzehjxpgnsddz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5enVpa2t6emVoanhwZ25zZGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjI3NzAsImV4cCI6MjEwODIzODc3MH0.5Ysvj3DzuR7QL9FFcwIuC__Eq5UD2QhPE5ZQBI1v7uY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// WhatsApp API Setup
// ⚠️ REPLACE THESE WITH YOUR ACTUAL IDs
const WHATSAPP_TOKEN = 'EAActpmZBw03kBSyHwZAX3sikBYrCItQbHYGhJ4t7AEX7yBHN7qPeFOSZCaPO9d2nne3uzn089LL86cubokBAFDJOgA7s2ILikGJM3FGYAQ5veBPW6fJJAPNyZC2nP6IupqTjhlnASvcUZCL5mBbUy70etEvM43vy0Y5mIZCxmAZCxXduOuqTwZBtKbsAG0mtiD9J7Nj3NsuV8HNbRMyN3ccoSn6hPdnkANZAejDcagvB2GPbRAJNgZC8yH1kW7OHL5CnQbV6N3zOfZB2dmRInNDVAZDZD'; 
const PHONE_NUMBER_ID = '1472307879292652';
const AGENT_PHONE_NUMBER = '27821234567'; // ⚠️ Put YOUR number here for testing

// API route to get properties for the website
app.get('/api/properties', async (req, res) => {
    const { data, error } = await supabase.from('properties').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

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
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
            
            const message = body.entry[0].changes[0].value.messages[0];
            const contact = body.entry[0].changes[0].value.contacts[0];
            const fromNumber = message.from;
            const leadName = contact.profile.name;
            const messageText = message.text ? message.text.body : "[Media/Other]";

            console.log(`📥 Received lead from ${leadName} (${fromNumber})`);

            // Extract Property ID if it exists in the message (e.g., "Ref: ID-2")
            let propertyId = null;
            const refMatch = messageText.match(/Ref:\s*ID-(\d+)/i);
            if (refMatch) propertyId = refMatch[1];

            // 1. SAVE TO SUPABASE (With Property ID)
            const { error } = await supabase.from('leads').insert([
                { name: leadName, phone: fromNumber, message: messageText, property_id: propertyId }
            ]);
            
            if (error) console.error("❌ Supabase Error:", error);
            else console.log("✅ Lead saved to DB!");

            // 2. AUTO-REPLY TO THE BUYER
            try {
                await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                    messaging_product: "whatsapp",
                    to: fromNumber,
                    text: { body: `Hi ${leadName}, this is Prop247. Thanks for your enquiry. One of our agents will be in contact with you shortly on WhatsApp.` }
                }, {
                    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
                });
                console.log("✅ Auto-reply sent to buyer!");
            } catch (err) {
                console.error("❌ Failed to send auto-reply:", err.response?.data || err.message);
            }

            // 3. NOTIFY THE AGENT
            try {
                const agentLink = `https://wa.me/${fromNumber}?text=Hi%20${leadName},%20I%20am%20responding%20to%20your%20Prop247%20enquiry.`;
                
                await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                    messaging_product: "whatsapp",
                    to: AGENT_PHONE_NUMBER,
                    text: { body: `🚨 *NEW LEAD*\n\n👤 Name: ${leadName}\n📱 Phone: ${fromNumber}\n💬 Message: ${messageText}\n\n👇 Click here to reply:\n${agentLink}` }
                }, {
                    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
                });
                console.log("✅ Agent notified!");
            } catch (err) {
                console.error("❌ Failed to notify agent:", err.response?.data || err.message);
            }
        }
    }
    res.sendStatus(200);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Webhook listening on port ${PORT}`);
});
