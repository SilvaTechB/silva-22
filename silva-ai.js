// ✅ Silva AI WhatsApp Bot - Multi-AI Failover Version
const { File: BufferFile } = require('node:buffer');
global.File = BufferFile;

const baileys = require('@whiskeysockets/baileys');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason, isJidGroup } = baileys;
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const P = require('pino');
const axios = require('axios');
const PQueue = require('p-queue');
const config = require('./config.js');

// ✅ Constants
const prefix = config.PREFIX || '.';
const tempDir = path.join(os.tmpdir(), 'silva-cache');
const port = process.env.PORT || 25680;
const logDir = path.join(__dirname, 'logs');

// ✅ AI Providers
const AI_PROVIDERS = [
    {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        models: ['gpt-4o', 'gpt-4o-mini'],
        headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` }
    },
    {
        name: 'Claude',
        endpoint: 'https://api.anthropic.com/v1/messages',
        models: ['claude-3-opus-20240229', 'claude-3-haiku-20240307'],
        headers: {
            Authorization: `Bearer ${config.CLAUDE_API_KEY}`,
            'x-api-key': config.CLAUDE_API_KEY,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
        }
    },
    {
        name: 'Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
        models: ['gemini-pro'],
        headers: { 'Content-Type': 'application/json' }
    }
];

// ✅ Rate Limiter
const aiQueue = new PQueue({ interval: 1000, intervalCap: 1 });
const userCooldown = new Map();
const COOLDOWN_MS = 5000;

// ✅ Memory System
class MemoryManager {
    constructor() {
        this.memoryPath = path.join(__dirname, 'conversation_memory.json');
        this.conversations = this.loadMemory();
        this.maxHistory = config.MAX_HISTORY || 1000;
    }
    loadMemory() {
        try {
            return fs.existsSync(this.memoryPath) ? 
                JSON.parse(fs.readFileSync(this.memoryPath)) : {};
        } catch {
            return {};
        }
    }
    saveMemory() {
        fs.writeFileSync(this.memoryPath, JSON.stringify(this.conversations, null, 2));
    }
    getConversation(jid) {
        return this.conversations[jid] || [];
    }
    addMessage(jid, role, content) {
        if (!this.conversations[jid]) this.conversations[jid] = [];
        this.conversations[jid].push({ role, content, timestamp: Date.now() });
        if (this.conversations[jid].length > this.maxHistory) this.conversations[jid].shift();
        this.saveMemory();
    }
}
const memoryManager = new MemoryManager();

// ✅ Logging
function getLogFileName() {
    const date = new Date();
    return `messages-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.log`;
}
function logMessage(type, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}\n`;
    console.log(logEntry.trim());
    fs.appendFileSync(path.join(logDir, getLogFileName()), logEntry);
}

// ✅ Multi-Provider AI Function
async function getAIResponse(jid, userMessage) {
    return aiQueue.add(async () => {
        if (userCooldown.has(jid) && Date.now() - userCooldown.get(jid) < COOLDOWN_MS) {
            return "⚠️ Slow down! Wait a few seconds.";
        }
        userCooldown.set(jid, Date.now());

        const history = memoryManager.getConversation(jid);
        const messages = [
            { role: 'system', content: `You are Silva AI, a helpful WhatsApp assistant. Current date: ${new Date().toLocaleDateString()}.` },
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
        ];

        for (const provider of AI_PROVIDERS) {
            for (const model of provider.models) {
                try {
                    let payload, url, response;

                    if (provider.name === 'OpenAI') {
                        url = provider.endpoint;
                        payload = { model, messages, max_tokens: 1500, temperature: 0.7 };
                        response = await axios.post(url, payload, { headers: provider.headers });
                        const aiText = response.data.choices[0].message.content;
                        memoryManager.addMessage(jid, 'user', userMessage);
                        memoryManager.addMessage(jid, 'assistant', aiText);
                        return aiText;
                    }

                    if (provider.name === 'Claude') {
                        url = provider.endpoint;
                        payload = {
                            model,
                            max_tokens: 1500,
                            messages: messages.map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }))
                        };
                        response = await axios.post(url, payload, { headers: provider.headers });
                        const aiText = response.data.content[0].text;
                        memoryManager.addMessage(jid, 'user', userMessage);
                        memoryManager.addMessage(jid, 'assistant', aiText);
                        return aiText;
                    }

                    if (provider.name === 'Gemini') {
                        url = `${provider.endpoint}${model}:generateContent?key=${config.GEMINI_API_KEY}`;
                        payload = { contents: [{ role: 'user', parts: [{ text: userMessage }] }] };
                        response = await axios.post(url, payload, { headers: provider.headers });
                        const aiText = response.data.candidates[0].content.parts[0].text;
                        memoryManager.addMessage(jid, 'user', userMessage);
                        memoryManager.addMessage(jid, 'assistant', aiText);
                        return aiText;
                    }

                } catch (error) {
                    logMessage('WARN', `${provider.name} (${model}) failed: ${error.response?.status || error.message}`);
                    if (error.response?.status === 429) {
                        await new Promise(res => setTimeout(res, 5000)); // Retry delay
                    }
                }
            }
        }

        return "⚠️ All AI providers are busy. Try again later.";
    });
}

// ✅ WhatsApp Connection
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: P({ level: config.DEBUG ? 'debug' : 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        auth: state,
        version,
        markOnlineOnConnect: config.ALWAYS_ONLINE
    });

    sock.ev.on('connection.update', async update => {
        const { connection } = update;
        if (connection === 'open') {
            logMessage('SUCCESS', '✅ Connected to WhatsApp');
            await sock.updateProfileStatus(`✨ ${config.BOT_NAME} Online ✦ ${new Date().toLocaleString()}`);
        } else if (connection === 'close') {
            logMessage('WARN', 'Connection closed. Reconnecting...');
            setTimeout(() => connectToWhatsApp(), 10000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;
        const sender = m.key.remoteJid;
        const messageType = Object.keys(m.message)[0];
        let content = m.message[messageType]?.text || m.message[messageType]?.caption || '';
        if (!content) return;

        try {
            const aiResponse = await getAIResponse(sender, content);
            await sock.sendMessage(sender, { text: aiResponse }, { quoted: m });
        } catch (err) {
            logMessage('ERROR', `Message Handling Error: ${err.message}`);
        }
    });
}

// ✅ Express
const app = express();
app.get('/', (_, res) => res.send(`✅ ${config.BOT_NAME} is running with multi-AI failover.`));
app.listen(port, () => logMessage('INFO', `Server running on port ${port}`));

(async () => {
    logMessage('INFO', '🚀 Starting Silva AI with Multi-AI Failover...');
    await connectToWhatsApp();
})();
