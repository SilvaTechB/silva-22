// ✅ Silva AI WhatsApp Bot - Fixed Version with Queue & Backoff
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
const PQueue = require('p-queue'); // ✅ Rate Limiter
const config = require('./config.js');

// ✅ Constants
const prefix = config.PREFIX || '.';
const tempDir = path.join(os.tmpdir(), 'silva-cache');
const port = process.env.PORT || 25680;
const pluginsDir = path.join(__dirname, 'plugins');
const logDir = path.join(__dirname, 'logs');

// ✅ AI Configuration
const AI_PROVIDER = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini'], // ✅ fallback models
    headers: { 'Authorization': `Bearer ${config.OPENAI_API_KEY}` }
};

// ✅ Rate Limiter & Spam Control
const aiQueue = new PQueue({ interval: 1000, intervalCap: 1 }); // 1 request/sec
const userCooldown = new Map(); // { jid: timestamp }
const COOLDOWN_MS = 5000; // 5 sec per user

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
        } catch (e) {
            console.error('Memory load error:', e);
            return {};
        }
    }
    saveMemory() {
        try {
            fs.writeFileSync(this.memoryPath, JSON.stringify(this.conversations, null, 2));
        } catch (e) {
            console.error('Memory save error:', e);
        }
    }
    getConversation(jid) {
        return this.conversations[jid] || [];
    }
    addMessage(jid, role, content) {
        if (!this.conversations[jid]) this.conversations[jid] = [];
        this.conversations[jid].push({ role, content, timestamp: Date.now() });
        if (this.conversations[jid].length > this.maxHistory) {
            this.conversations[jid].shift();
        }
        this.saveMemory();
    }
    clearConversation(jid) {
        delete this.conversations[jid];
        this.saveMemory();
    }
}
const memoryManager = new MemoryManager();

// ✅ Global Context Info
const globalContextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363200367779016@newsletter',
        newsletterName: '◢◤ Silva Tech Inc ◢◤',
        serverMessageId: 144
    },
    externalAdReply: {
        title: `✦ ${config.BOT_NAME} ✦`,
        body: "Powered by SilvaTechInc",
        thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
        sourceUrl: "https://github.com/SilvaTechB/silva-md-bot",
        mediaType: 1,
        renderLargerThumbnail: true
    }
};

// ✅ Setup Directories
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// ✅ Clean temp files periodically
setInterval(() => {
    fs.readdirSync(tempDir).forEach(file => fs.unlinkSync(path.join(tempDir, file)));
}, 5 * 60 * 1000);

// ✅ Logger Functions
function getLogFileName() {
    const date = new Date();
    return `messages-${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.log`;
}
function logMessage(type, message) {
    if (!config.DEBUG && type === 'DEBUG') return;
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}\n`;
    console.log(logEntry.trim());
    fs.appendFileSync(path.join(logDir, getLogFileName()), logEntry);
}

// ✅ AI Response with Queue + Backoff
async function getAIResponse(jid, userMessage) {
    return aiQueue.add(async () => {
        try {
            // ✅ Check Cooldown
            const now = Date.now();
            if (userCooldown.has(jid) && now - userCooldown.get(jid) < COOLDOWN_MS) {
                return "⚠️ Please wait a few seconds before asking again.";
            }
            userCooldown.set(jid, now);

            const history = memoryManager.getConversation(jid);
            const messages = [
                { role: 'system', content: `You are Silva AI, a helpful WhatsApp assistant. Current date: ${new Date().toLocaleDateString()}.` },
                ...history.map(msg => ({ role: msg.role, content: msg.content })),
                { role: 'user', content: userMessage }
            ];

            let aiResponse;
            let lastError;

            for (const model of AI_PROVIDER.models) {
                try {
                    const response = await axios.post(AI_PROVIDER.endpoint, {
                        model,
                        messages,
                        max_tokens: 1500,
                        temperature: 0.7
                    }, { headers: AI_PROVIDER.headers, timeout: 30000 });

                    aiResponse = response.data.choices[0].message.content;
                    break; // ✅ success
                } catch (error) {
                    lastError = error;
                    const status = error.response?.status;

                    if (status === 429) {
                        logMessage('WARN', `Rate limit hit for ${model}, retrying in 5s...`);
                        await new Promise(res => setTimeout(res, 5000));
                    } else {
                        logMessage('WARN', `Model ${model} failed: ${error.message}`);
                    }
                }
            }

            if (!aiResponse) {
                logMessage('ERROR', `OpenAI Failed: ${lastError?.message}`);
                aiResponse = `⚠️ I'm currently overloaded. Please try again later.`;
            }

            memoryManager.addMessage(jid, 'user', userMessage);
            memoryManager.addMessage(jid, 'assistant', aiResponse);

            return aiResponse;
        } catch (error) {
            logMessage('ERROR', `AI Failed: ${error.message}`);
            return "⚠️ Sorry, I'm unable to process your request right now.";
        }
    });
}

// ✅ WhatsApp Connection
async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'));
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            logger: P({ level: config.DEBUG ? 'debug' : 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.macOS('Safari'),
            auth: state,
            version,
            markOnlineOnConnect: config.ALWAYS_ONLINE,
            syncFullHistory: false
        });

        sock.ev.on('connection.update', async update => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                logMessage('WARN', `Connection closed: ${statusCode || 'Unknown'}`);
                setTimeout(() => connectToWhatsApp(), 10000);
            } else if (connection === 'open') {
                logMessage('SUCCESS', '✅ Connected to WhatsApp');
                await updateProfileStatus(sock);
                await sendWelcomeMessage(sock);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            const m = messages[0];
            if (!m.message) return;

            const sender = m.key.remoteJid;
            const isGroup = isJidGroup(sender);
            if (isGroup && !config.GROUP_COMMANDS) return;

            const messageType = Object.keys(m.message)[0];
            let content = '';
            if (messageType === 'conversation') content = m.message.conversation;
            else if (messageType === 'extendedTextMessage') content = m.message.extendedTextMessage.text || '';
            else if (messageType === 'imageMessage') content = m.message.imageMessage.caption || '';
            else if (messageType === 'videoMessage') content = m.message.videoMessage.caption || '';
            if (!content) return;

            if (config.READ_MESSAGE) await sock.readMessages([m.key]);

            try {
                const aiResponse = await getAIResponse(sender, content);
                await sock.sendMessage(sender, { text: aiResponse, contextInfo: globalContextInfo }, { quoted: m });
            } catch (err) {
                logMessage('ERROR', `AI Processing Error: ${err.message}`);
                await sock.sendMessage(sender, { text: "⚠️ AI error occurred.", contextInfo: globalContextInfo }, { quoted: m });
            }
        });

        return sock;
    } catch (e) {
        logMessage('CRITICAL', `Connection failed: ${e.message}`);
        setTimeout(() => connectToWhatsApp(), 10000);
    }
}

async function updateProfileStatus(sock) {
    const bio = `✨ ${config.BOT_NAME} Online ✦ ${new Date().toLocaleString()}`;
    try {
        await sock.updateProfileStatus(bio);
        logMessage('SUCCESS', `✅ Bio updated: ${bio}`);
    } catch (err) {
        logMessage('ERROR', `❌ Failed to update bio: ${err.message}`);
    }
}

async function sendWelcomeMessage(sock) {
    await sock.sendMessage(sock.user.id, {
        image: { url: config.ALIVE_IMG },
        caption: `✅ ${config.BOT_NAME} is running!\nPowered by OpenAI.\nMode: ${config.MODE}`
    });
}

// ✅ Express Server
const app = express();
app.get('/', (req, res) => res.send(`✅ ${config.BOT_NAME} is Running!`));
app.listen(port, () => logMessage('INFO', `🌐 Server running on port ${port}`));

// ✅ Start Bot
(async () => {
    try {
        logMessage('INFO', '🚀 Starting Silva AI WhatsApp Bot...');
        await connectToWhatsApp();
    } catch (e) {
        logMessage('CRITICAL', `Bot Init Failed: ${e.stack}`);
        setTimeout(() => connectToWhatsApp(), 5000);
    }
})();
