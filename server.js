const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

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
    console.log('Webhook payload received:', JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Webhook server listening on port ${PORT}`);
});
