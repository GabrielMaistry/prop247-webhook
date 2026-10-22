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
// ⚠️ REPLACE THIS WITH YOUR PERMANENT SYSTEM USER TOKEN
const WHATSAPP_TOKEN = 'EAActpmZBw03kBS5Ktkb7TQd5n2DLHWEv3Oc8TSKN7lQZCUFZA3BLF4QZCiQul2BcIWcU0cQ0Wl2R2um9V7oJ5smGFZANZA6leZCmbZBWb71KeZBd4B7uHlXnIGYqq0I5HI9nSrRADpenSe5n0rIuTOz8gzcR30uZC4mwYyzvb4ZBjuO986nAnBYo0KvEiZCx9oXOdgZDZD'; 
const PHONE_NUMBER_ID = '1472307879292652';
const AGENT_PHONE_NUMBER = '27637662817'; // ⚠️ Put YOUR number here for testing

// API route to get properties for the website
app.get('/api/properties', async (req, res) => {
    const { data, error } = await supabase.from('properties').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// ==========================================
// AGENT DASHBOARD ROUTE
// ==========================================
app.get('/dashboard', async (req, res) => {
    const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).send("Error loading leads");

    let tableRows = leads.map(lead => {
        let statusColor = '#ccc';
        if (lead.status === 'New') statusColor = '#ff9800'; 
        if (lead.status === 'Contacted') statusColor = '#2196f3'; 
        if (lead.status === 'Closed') statusColor = '#4caf50'; 

        return `
        <tr>
            <td>${new Date(lead.created_at).toLocaleString()}</td>
            <td><strong>${lead.name || 'Unknown'}</strong></td>
            <td><a href="https://wa.me/${lead.phone}" target="_blank">${lead.phone}</a></td>
            <td>${lead.message}</td>
            <td>${lead.property_id ? `ID-${lead.property_id}` : 'N/A'}</td>
            <td><span style="background:${statusColor}; color:white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${lead.status || 'New'}</span></td>
        </tr>
        `;
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Prop247 Agent Dashboard</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; background: #f4f6f8; margin: 0; }
                h1 { color: #333; }
                .stats { margin-bottom: 20px; font-size: 18px; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background-color: #0057ff; color: white; }
                tr:hover { background-color: #f1f1f1; }
                a { color: #25D366; font-weight: bold; text-decoration: none; }
            </style>
        </head>
        <body>
            <h1>📥 Prop247 Lead Inbox</h1>
            <div class="stats">Total Leads: <strong>${leads.length}</strong></div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Phone (Click to Reply)</th>
                        <th>Message</th>
                        <th>Property Ref</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </body>
        </html>
    `);
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

            // ==========================================
            // HANDLE BUTTON REPLIES (Pre-qualifying)
            // ==========================================
            if (message.type === 'button') {
                const buttonPayload = message.button.payload; 
                console.log(`🔘 Buyer clicked: ${buttonPayload}`);
                
                // Update the lead in the database with their answer
                const answer = buttonPayload === 'financing_cash' ? 'Cash Buyer' : 'Needs Financing';
                await supabase.from('leads').update({ message: `Pre-qualified: ${answer}` }).eq('phone', fromNumber);
                
                try {
                    await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                        messaging_product: "whatsapp",
                        to: fromNumber,
                        text: { body: `Thanks for letting us know! An agent will be in touch shortly to assist you further.` }
                    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
                    console.log("✅ Confirmation sent to buyer!");
                } catch (err) {
                    console.error("❌ Failed to send confirmation:", err.response?.data || err.message);
                }
                
                return res.sendStatus(200); // Stop processing further
            }

            // ==========================================
            // HANDLE STANDARD TEXT MESSAGES
            // ==========================================
            const messageText = message.text ? message.text.body : "[Media/Other]";
            console.log(`📥 Received lead from ${leadName} (${fromNumber})`);

            // Extract Property ID if it exists in the message
            let propertyId = null;
            const refMatch = messageText.match(/Ref:\s*ID-(\d+)/i);
            if (refMatch) propertyId = refMatch[1];

            // 1. SAVE TO SUPABASE
            const { error } = await supabase.from('leads').insert([
                { name: leadName, phone: fromNumber, message: messageText, property_id: propertyId }
            ]);
            
            if (error) console.error("❌ Supabase Error:", error);
            else console.log("✅ Lead saved to DB!");

            // 2. AUTO-REPLY WITH INTERACTIVE BUTTONS (Pre-qualifying)
            try {
                await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                    messaging_product: "whatsapp",
                    to: fromNumber,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `Hi ${leadName}, thanks for your enquiry. To help us assist you better, please answer this quick question:` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "financing_yes", title: "Financing" } },
                                { type: "reply", reply: { id: "financing_cash", title: "Cash" } }
                            ]
                        }
                    }
                }, {
                    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
                });
                console.log("✅ Pre-qualifying buttons sent to buyer!");
            } catch (err) {
                console.error("❌ Failed to send buttons:", err.response?.data || err.message);
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
