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
const WHATSAPP_TOKEN = 'EAActpmZBw03kBS5Ktkb7TQd5n2DLHWEv3Oc8TSKN7lQZCUFZA3BLF4QZCiQul2BcIWcU0cQ0Wl2R2um9V7oJ5smGFZANZA6leZCmbZBWb71KeZBd4B7uHlXnIGYqq0I5HI9nSrRADpenSe5n0rIuTOz8gzcR30uZC4mwYyzvb4ZBjuO986nAnBYo0KvEiZCx9oXOdgZDZD'; 
const PHONE_NUMBER_ID = '1472307879292652';
const AGENT_PHONE_NUMBER = '27637662817'; 

// ==========================================
// AGENT DASHBOARD
// ==========================================
app.get('/dashboard', async (req, res) => {
    const { data: leads, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).send("Error loading leads");

    let tableRows = leads.map(lead => {
        let statusColor = '#ccc';
        if (lead.requires_human) statusColor = '#f44336'; 
        else if (lead.status === 'New') statusColor = '#ff9800'; 
        else if (lead.status === 'Contacted') statusColor = '#2196f3'; 
        else if (lead.status === 'Closed') statusColor = '#4caf50'; 
        const statusText = lead.requires_human ? '🚨 NEEDS HUMAN' : (lead.status || 'New');

        return `
        <tr>
            <td>${new Date(lead.created_at).toLocaleString()}</td>
            <td><strong>${lead.name || 'Unknown'}</strong></td>
            <td><a href="https://wa.me/${lead.phone}" target="_blank">${lead.phone}</a></td>
            <td>${lead.message || '-'}</td>
            <td>${lead.property_id ? `ID-${lead.property_id}` : 'N/A'}</td>
            <td>${lead.prequalified || '-'}</td>
            <td>${lead.intent || '-'}</td>
            <td><span style="background:${statusColor}; color:white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight:bold;">${statusText}</span></td>
        </tr>`;
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Prop247 Dashboard</title>
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f4f6f8; }
                table { width: 100%; border-collapse: collapse; background: white; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background-color: #0057ff; color: white; }
                a { color: #25D366; font-weight: bold; text-decoration: none; }
            </style>
        </head>
        <body>
            <h1>📥 Prop247 Lead Inbox</h1>
            <table>
                <thead><tr><th>Date</th><th>Name</th><th>Phone</th><th>Message</th><th>Property</th><th>Financing</th><th>Intent</th><th>Status</th></tr></thead>
                <tbody>${tableRows}</tbody>
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
        if (mode === 'subscribe' && token === VERIFY_TOKEN) res.status(200).send(challenge);
        else res.sendStatus(403);
    } else res.sendStatus(400);
});

// Helpers
async function sendText(to, text) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to: to, text: { body: text }
        }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    } catch (err) { console.error("❌ Text Error:", err.response?.data || err.message); }
}

async function sendButtons(to, text, buttons) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to: to, type: "interactive",
            interactive: { type: "button", body: { text: text }, action: { buttons: buttons } }
        }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    } catch (err) { console.error("❌ Button Error:", err.response?.data || err.message); }
}

// ==========================================
// WEBHOOK (Conversational State Machine)
// ==========================================
app.post('/webhook', async (req, res) => {
    // LOG EVERYTHING IMMEDIATELY
    console.log("📥 WEBHOOK HIT:", JSON.stringify(req.body, null, 2));

    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
                
                const message = body.entry[0].changes[0].value.messages[0];
                const contact = body.entry[0].changes[0].value.contacts[0];
                const fromNumber = message.from;
                const leadName = contact.profile.name || "Customer";
                
                // 1. CHECK FOR HUMAN REQUEST
                const textContent = message.text ? message.text.body.toLowerCase() : "";
                const isAskingForHuman = textContent.includes("agent") || textContent.includes("human") || textContent.includes("help");

                if (isAskingForHuman) {
                    const { data: existingLead } = await supabase.from('leads').select('*').eq('phone', fromNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
                    
                    if (existingLead) {
                        await supabase.from('leads').update({ requires_human: true, bot_state: 'HUMAN' }).eq('id', existingLead.id);
                    } else {
                        await supabase.from('leads').insert([{ name: leadName, phone: fromNumber, message: textContent, requires_human: true, bot_state: 'HUMAN' }]);
                    }

                    await sendText(fromNumber, `No problem at all! 🙋‍♂️ I have paused the assistant and alerted our human agent. They will jump into this chat shortly.`);
                    
                    const agentLink = `https://wa.me/${fromNumber}?text=Hi%20${leadName},%20I%20am%20taking%20over%20your%20Prop247%20enquiry.`;
                    await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                        messaging_product: "whatsapp", to: AGENT_PHONE_NUMBER,
                        text: { body: `🚨 *URGENT: HUMAN REQUESTED* 🚨\n\n👤 Name: ${leadName}\n📱 Phone: ${fromNumber}\n\n👇 Click here to take over:\n${agentLink}` }
                    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
                    
                    return res.sendStatus(200);
                }

                // Check if human is already handling
                const { data: checkLead } = await supabase.from('leads').select('requires_human').eq('phone', fromNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
                if (checkLead && checkLead.requires_human) {
                    return res.sendStatus(200); 
                }

                // --- FLOW ---
                const { data: existingLead } = await supabase.from('leads').select('*').eq('phone', fromNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
                let currentState = existingLead ? existingLead.bot_state : 'START';

                // START
                if (!existingLead || currentState === 'DONE') {
                    let propertyId = null;
                    if (message.text) {
                        const refMatch = message.text.body.match(/Ref:\s*ID-(\d+)/i);
                        if (refMatch) propertyId = refMatch[1];
                    }

                    await supabase.from('leads').insert([{ 
                        name: leadName, phone: fromNumber, message: textContent, 
                        property_id: propertyId, bot_state: 'ASK_INTENT' 
                    }]);

                    await sendButtons(fromNumber, 
                        `Hey ${leadName}! 👋 Welcome to Prop247.\n\nI'm your virtual assistant. I'd love to help you find your dream property (or sell yours!). \n\nFirst things first: Are you looking to **Buy** or **Sell**?`, 
                        [{ type: "reply", reply: { id: "q1_buy", title: "🏠 Buy" } }, { type: "reply", reply: { id: "q1_sell", title: "🏷️ Sell" } }]
                    );
                    return res.sendStatus(200);
                }

                // ASK FINANCING
                if (message.type === 'button' && currentState === 'ASK_INTENT') {
                    const intent = message.button.payload === 'q1_buy' ? 'Buying' : 'Selling';
                    await supabase.from('leads').update({ intent: intent, bot_state: 'ASK_FINANCING' }).eq('id', existingLead.id);

                    await sendButtons(fromNumber, 
                        `Awesome! ${intent} it is. ✅\n\nJust one last question: How are you planning to fund this?`, 
                        [{ type: "reply", reply: { id: "q3_cash", title: "💵 Cash" } }, { type: "reply", reply: { id: "q3_finance", title: "🏦 Financing" } }]
                    );
                    return res.sendStatus(200);
                }

                // FINISH
                if (message.type === 'button' && currentState === 'ASK_FINANCING') {
                    const financing = message.button.payload === 'q3_cash' ? 'Cash' : 'Financing';
                    await supabase.from('leads').update({ prequalified: financing, bot_state: 'DONE' }).eq('id', existingLead.id);

                    await sendText(fromNumber, 
                        `Perfect! 🎉 I have all the details I need.\n\nOne of our top agents will be in touch with you shortly.\n\n*(Remember, if you ever want to speak to a human immediately, just type "Agent")*`
                    );

                    const agentLink = `https://wa.me/${fromNumber}?text=Hi%20${leadName},%20I%20am%20responding%20to%20your%20Prop247%20enquiry.`;
                    await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                        messaging_product: "whatsapp", to: AGENT_PHONE_NUMBER,
                        text: { body: `🚨 *NEW HOT LEAD* 🚨\n\n👤 Name: ${leadName}\n📱 Phone: ${fromNumber}\n🎯 Intent: ${existingLead.intent}\n💰 Financing: ${financing}\n\n👇 Click here to chat with the buyer:\n${agentLink}` }
                    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
                    
                    return res.sendStatus(200);
                }
            }
        }
    } catch (error) {
        console.error("🚨 FATAL ERROR IN WEBHOOK:", error);
    }
    res.sendStatus(200);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Webhook listening on port ${PORT}`);
});
