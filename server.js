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

// Helpers with detailed error logging
async function sendText(to, text) {
    try {
        const res = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to: to, text: { body: text }
        }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
        console.log("✅ Text sent successfully:", res.data.messages[0].id);
    } catch (err) { 
        console.error("❌ TEXT ERROR FROM META:", JSON.stringify(err.response?.data || err.message, null, 2)); 
    }
}

async function sendButtons(to, text, buttons) {
    try {
        const res = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to: to, type: "interactive",
            interactive: { type: "button", body: { text: text }, action: { buttons: buttons } }
        }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
        console.log("✅ Buttons sent successfully:", res.data.messages[0].id);
    } catch (err) { 
        console.error("❌ BUTTON ERROR FROM META:", JSON.stringify(err.response?.data || err.message, null, 2)); 
    }
}

// WEBHOOK
app.post('/webhook', async (req, res) => {
    console.log("📥 WEBHOOK HIT!");

    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
                
                const message = body.entry[0].changes[0].value.messages[0];
                const contact = body.entry[0].changes[0].value.contacts[0];
                const fromNumber = message.from;
                const leadName = contact.profile.name || "Customer";
                
                console.log(`📱 Message from: ${leadName} (${fromNumber})`);

                const textContent = message.text ? message.text.body.toLowerCase() : "";

                // Check if human requested
                if (textContent.includes("agent") || textContent.includes("human")) {
                    console.log("🙋‍♂️ Agent requested");
                    await sendText(fromNumber, `No problem! 🙋‍♂️ I am connecting you with a human agent now.`);
                    const agentLink = `https://wa.me/${fromNumber}?text=Hi%20${leadName},%20I%20am%20taking%20over%20your%20enquiry.`;
                    await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                        messaging_product: "whatsapp", to: AGENT_PHONE_NUMBER,
                        text: { body: `🚨 *URGENT: HUMAN REQUESTED* 🚨\n\n👤 Name: ${leadName}\n📱 Phone: ${fromNumber}\n\n👇 Click to take over:\n${agentLink}` }
                    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
                    return res.sendStatus(200);
                }

                // Create or get lead
                const { data: existingLead, error: dbError } = await supabase.from('leads').select('*').eq('phone', fromNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
                
                if (dbError) {
                    console.error("❌ DATABASE ERROR (FETCH):", dbError);
                }

                let currentState = existingLead ? existingLead.bot_state : 'START';
                console.log(`🔄 Current State: ${currentState}`);

                if (!existingLead || currentState === 'DONE') {
                    console.log("🆕 New lead. Inserting to DB...");
                    const { error: insertError } = await supabase.from('leads').insert([{ name: leadName, phone: fromNumber, message: textContent, bot_state: 'ASK_INTENT' }]);
                    
                    if (insertError) {
                        console.error("❌ DATABASE ERROR (INSERT):", insertError);
                        return res.sendStatus(200); // Stop if DB fails
                    }

                    console.log("✉️ Sending buttons...");
                    await sendButtons(fromNumber, `Hey ${leadName}! 👋 Welcome to Prop247.\n\nAre you looking to **Buy** or **Sell**?`, 
                        [{ type: "reply", reply: { id: "q1_buy", title: "🏠 Buy" } }, { type: "reply", reply: { id: "q1_sell", title: "🏷️ Sell" } }]);
                    return res.sendStatus(200);
                }

                if (message.type === 'button' && currentState === 'ASK_INTENT') {
                    const intent = message.button.payload === 'q1_buy' ? 'Buying' : 'Selling';
                    await supabase.from('leads').update({ intent: intent, bot_state: 'ASK_FINANCING' }).eq('id', existingLead.id);
                    console.log(`✉️ Sending financing buttons...`);
                    await sendButtons(fromNumber, `Awesome! ${intent} it is. ✅\n\nHow are you planning to fund this?`, 
                        [{ type: "reply", reply: { id: "q3_cash", title: "💵 Cash" } }, { type: "reply", reply: { id: "q3_finance", title: "🏦 Financing" } }]);
                    return res.sendStatus(200);
                }

                if (message.type === 'button' && currentState === 'ASK_FINANCING') {
                    const financing = message.button.payload === 'q3_cash' ? 'Cash' : 'Financing';
                    await supabase.from('leads').update({ prequalified: financing, bot_state: 'DONE' }).eq('id', existingLead.id);
                    console.log(`✉️ Sending final text...`);
                    await sendText(fromNumber, `Perfect! 🎉 I have all the details. An agent will be in touch shortly.`);
                    const agentLink = `https://wa.me/${fromNumber}?text=Hi%20${leadName},%20I%20am%20responding%20to%20your%20enquiry.`;
                    await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                        messaging_product: "whatsapp", to: AGENT_PHONE_NUMBER,
                        text: { body: `🚨 *NEW LEAD* 🚨\n\n👤 Name: ${leadName}\n📱 Phone: ${fromNumber}\n🎯 Intent: ${existingLead.intent}\n💰 Financing: ${financing}\n\n👇 Click here to chat:\n${agentLink}` }
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

app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else res.sendStatus(403);
});

app.get('/dashboard', async (req, res) => {
    const { data: leads, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).send("Error loading leads");
    let tableRows = leads.map(lead => `
        <tr>
            <td>${new Date(lead.created_at).toLocaleString()}</td>
            <td><strong>${lead.name || 'Unknown'}</strong></td>
            <td><a href="https://wa.me/${lead.phone}" target="_blank">${lead.phone}</a></td>
            <td>${lead.message || '-'}</td>
            <td>${lead.prequalified || '-'}</td>
            <td>${lead.intent || '-'}</td>
            <td>${lead.bot_state || '-'}</td>
        </tr>`).join('');
    res.send(`<html><body style="font-family:sans-serif;padding:20px;"><h1>📥 Prop247 Leads</h1><table border="1" style="width:100%;border-collapse:collapse;"><tr><th>Date</th><th>Name</th><th>Phone</th><th>Message</th><th>Financing</th><th>Intent</th><th>State</th></tr>${tableRows}</table></body></html>`);
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
