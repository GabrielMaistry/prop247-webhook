const express = require('express');
const axios = require('axios'); 
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup for agent logins
app.use(session({
    secret: 'prop247-super-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS in production
}));

const VERIFY_TOKEN = "prop247_secret_123";

// Supabase Setup
const SUPABASE_URL = 'https://byzuikkzzehjxpgnsddz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5enVpa2t6emVoanhwZ25zZGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjI3NzAsImV4cCI6MjEwODIzODc3MH0.5Ysvj3DzuR7QL9FFcwIuC__Eq5UD2QhPE5ZQBI1v7uY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// WhatsApp API Setup
const WHATSAPP_TOKEN = 'EAActpmZBw03kBSzVYZB4zNj5q15DsOWuo6bxQnvLqZC8LiE8cJuuvWnX9oBaZB3bRZBW4gD972YrdCoIMEgzOx9zkOBrFeNJx2xP6ZCRT0e8ZCzjDy2g2jRUvYtZBTQmxengCFK4EHa18TtVWPs9Gx9CrMzoHU5QZBf6LNQZBVIYXNA6ehW1kja67T3xwiojj525peB49DcjEeqHgid9ui1wpyKJe5ojuJqJjj23XC'; 
const PHONE_NUMBER_ID = '1472307879292652';
const AGENT_PHONE_NUMBER = '27637662817'; // Admin test number

// --- HELPERS ---
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
// 1. AUTHENTICATION ROUTES
// ==========================================
app.get('/login', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; background:#f4f6f8; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <form method="POST" action="/login" style="background:white; padding:40px; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.1); width:300px;">
                <h2 style="text-align:center; color:#0057ff;">Prop247 Agent Login</h2>
                <input type="email" name="email" placeholder="Email" required style="width:100%; padding:10px; margin-bottom:15px; border:1px solid #ccc; border-radius:5px; box-sizing:border-box;">
                <input type="password" name="password" placeholder="Password" required style="width:100%; padding:10px; margin-bottom:20px; border:1px solid #ccc; border-radius:5px; box-sizing:border-box;">
                <button type="submit" style="width:100%; padding:10px; background:#0057ff; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">Login</button>
            </form>
        </body>
    `);
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const { data: agent } = await supabase.from('agents').select('*').eq('email', email).eq('password', password).single();
    
    if (agent) {
        req.session.agent = agent;
        res.redirect('/dashboard');
    } else {
        res.send("Invalid credentials. <a href='/login'>Try again</a>");
    }
});

// ==========================================
// 2. THE NEW CRM DASHBOARD (Protected)
// ==========================================
app.get('/dashboard', async (req, res) => {
    if (!req.session.agent) return res.redirect('/login'); // Protect the route

    const { data: leads } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    
    let tableRows = leads.map(lead => {
        let statusColor = '#ccc';
        let statusText = 'Unassigned';
        
        if (lead.claimed_by) {
            statusColor = '#4caf50'; // Green
            statusText = `Claimed by: ${lead.claimed_by}`;
        } else if (lead.requires_human) {
            statusColor = '#f44336'; // Red
            statusText = '🚨 NEEDS HUMAN';
        } else if (lead.bot_state === 'DONE') {
            statusColor = '#2196f3'; // Blue
            statusText = 'Qualified (Unassigned)';
        } else {
            statusColor = '#ff9800'; // Orange
            statusText = 'In Progress';
        }

        // Only show claim button if it's unassigned
        let actionBtn = lead.claimed_by ? '' : `<form method="POST" action="/claim/${lead.id}" style="margin:0;"><button style="background:#0057ff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Claim Lead</button></form>`;

        return `
        <tr>
            <td>${new Date(lead.created_at).toLocaleString()}</td>
            <td><strong>${lead.name || 'Unknown'}</strong></td>
            <td><a href="https://wa.me/${lead.phone}" target="_blank" style="color:#25D366; font-weight:bold;">${lead.phone}</a></td>
            <td>${lead.message}</td>
            <td>${lead.intent || '-'}</td>
            <td>${lead.prequalified || '-'}</td>
            <td><span style="background:${statusColor}; color:white; padding:4px 8px; border-radius:4px; font-size:12px;">${statusText}</span></td>
            <td>${actionBtn}</td>
        </tr>`;
    }).join('');

    res.send(`
        <html>
        <head><title>Prop247 CRM</title></head>
        <body style="font-family:sans-serif; background:#f4f6f8; margin:0; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h1 style="color:#333;">📥 Prop247 CRM</h1>
                <div>Logged in as: <strong>${req.session.agent.name}</strong> | <a href="/logout">Logout</a></div>
            </div>
            <table style="width:100%; border-collapse:collapse; background:white; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                <thead>
                    <tr style="background:#0057ff; color:white;">
                        <th style="padding:12px; text-align:left;">Date</th>
                        <th style="padding:12px; text-align:left;">Name</th>
                        <th style="padding:12px; text-align:left;">Phone</th>
                        <th style="padding:12px; text-align:left;">Message</th>
                        <th style="padding:12px; text-align:left;">Intent</th>
                        <th style="padding:12px; text-align:left;">Financing</th>
                        <th style="padding:12px; text-align:left;">Status</th>
                        <th style="padding:12px; text-align:left;">Action</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </body>
        </html>
    `);
});

app.post('/claim/:id', async (req, res) => {
    if (!req.session.agent) return res.redirect('/login');
    
    const leadId = req.params.id;
    const agentName = req.session.agent.name;
    const agentPhone = req.session.agent.phone || AGENT_PHONE_NUMBER; // Fallback if agent has no phone in DB

    // 1. Update the database to lock the lead to this agent
    await supabase.from('leads').update({ claimed_by: agentName, status: 'Contacted' }).eq('id', leadId);
    
    // 2. Get the lead details to send the WhatsApp alert
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    
    // 3. Send the WhatsApp alert to the agent
    const agentLink = `https://wa.me/${lead.phone}?text=Hi%20${lead.name},%20I%20am%20${agentName}%20from%20Prop247.`;
    await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", 
        to: agentPhone, 
        text: { body: `✅ *LEAD CLAIMED*\n\nYou have claimed ${lead.name} (${lead.phone}).\n\n👇 Click here to start chatting with them:\n${agentLink}` }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });

    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ==========================================
// 3. WHATSAPP WEBHOOK & BOT FLOW
// ==========================================
app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else res.sendStatus(403);
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
                const leadName = contact.profile.name || "Customer";
                
                // 1. Check if the lead is already claimed by an agent
                const { data: existingLead } = await supabase.from('leads').select('*').eq('phone', fromNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
                
                if (existingLead && existingLead.claimed_by) {
                    console.log(`🤐 Agent ${existingLead.claimed_by} is handling this. Bot paused.`);
                    return res.sendStatus(200); // Stop bot, let agent handle
                }

                const textContent = message.text ? message.text.body.toLowerCase() : "";

                // 2. Human requested?
                if (textContent.includes("agent") || textContent.includes("human") || textContent.includes("help")) {
                    await supabase.from('leads').update({ requires_human: true, bot_state: 'HUMAN' }).eq('phone', fromNumber);
                    await sendText(fromNumber, `No problem! 🙋‍♂️ I have paused the bot. Please wait a moment while our team assigns an agent to you.`);
                    // Note: We don't send a specific link now. The agent claims it from the dashboard.
                    return res.sendStatus(200);
                }

                // 3. Conversational Flow
                let currentState = existingLead ? existingLead.bot_state : 'START';

                if (!existingLead || currentState === 'DONE') {
                    await supabase.from('leads').insert([{ name: leadName, phone: fromNumber, message: textContent, bot_state: 'ASK_INTENT' }]);
                    await sendButtons(fromNumber, `Hey ${leadName}! 👋 Welcome to Prop247.\n\nAre you looking to **Buy** or **Sell**?`, 
                        [{ type: "reply", reply: { id: "q1_buy", title: "🏠 Buy" } }, { type: "reply", reply: { id: "q1_sell", title: "🏷️ Sell" } }]);
                    return res.sendStatus(200);
                }

                if (message.type === 'button' && currentState === 'ASK_INTENT') {
                    const intent = message.button.payload === 'q1_buy' ? 'Buying' : 'Selling';
                    await supabase.from('leads').update({ intent: intent, bot_state: 'ASK_FINANCING' }).eq('id', existingLead.id);
                    await sendButtons(fromNumber, `Awesome! ${intent} it is. ✅\n\nHow are you planning to fund this?`, 
                        [{ type: "reply", reply: { id: "q3_cash", title: "💵 Cash" } }, { type: "reply", reply: { id: "q3_finance", title: "🏦 Financing" } }]);
                    return res.sendStatus(200);
                }

                if (message.type === 'button' && currentState === 'ASK_FINANCING') {
                    const financing = message.button.payload === 'q3_cash' ? 'Cash' : 'Financing';
                    await supabase.from('leads').update({ prequalified: financing, bot_state: 'DONE' }).eq('id', existingLead.id);
                    await sendText(fromNumber, `Perfect! 🎉 I have all the details. An agent will claim your file soon and be in touch shortly.`);
                    return res.sendStatus(200);
                }
            }
        }
    } catch (error) {
        console.error("🚨 FATAL ERROR:", error);
    }
    res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
