2025-08-06T16:01:45.555670+00:00 app[web.1]: [2025-08-06T16:01:45.555Z] [SUCCESS] ✅ Connected to WhatsApp
2025-08-06T16:01:45.668149+00:00 app[web.1]: [2025-08-06T16:01:45.668Z] [SUCCESS] ✅ Bio updated: ✨ ✦ Silva AI ✦ Online ✦ 8/6/2025, 4:01:45 PM
2025-08-06T16:03:56.667740+00:00 app[web.1]: [2025-08-06T16:03:56.667Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:04:20.305053+00:00 app[web.1]: [2025-08-06T16:04:20.304Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:12:32.030760+00:00 app[web.1]: [2025-08-06T16:12:32.030Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:13:28.425568+00:00 app[web.1]: [2025-08-06T16:13:28.425Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:13:46.508821+00:00 app[web.1]: [2025-08-06T16:13:46.508Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:14:08.275657+00:00 app[web.1]: [2025-08-06T16:14:08.275Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:16:36.119771+00:00 app[web.1]: [2025-08-06T16:16:36.119Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:18:01.833685+00:00 app[web.1]: [2025-08-06T16:18:01.833Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:18:27.559357+00:00 app[web.1]: [2025-08-06T16:18:27.559Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:20:06.047873+00:00 app[web.1]: [2025-08-06T16:20:06.047Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:20:36.696510+00:00 app[web.1]: [2025-08-06T16:20:36.696Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:20:45.815098+00:00 app[web.1]: [2025-08-06T16:20:45.815Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:23:59.924641+00:00 app[web.1]: [2025-08-06T16:23:59.924Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:26:53.052793+00:00 app[web.1]: [2025-08-06T16:26:53.052Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:27:41.455412+00:00 app[web.1]: [2025-08-06T16:27:41.455Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:28:31.512412+00:00 app[web.1]: [2025-08-06T16:28:31.512Z] [WARN] OpenAI model error: Request failed with status code 429
2025-08-06T16:28:59.245981+00:00 app[web.1]: [2025-08-06T16:28:59.245Z] [WARN] OpenAI model error: Request failed with status code 429
Disconnected from log stream. There may be events happening that you do not see here! Attempting to reconnect...
Connection to log stream failed. Please try again later.

in this 
// ✅ Silva AI WhatsApp Bot - OpenAI Only Version
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
const config = require('./config.js');

// Constants
const prefix = config.PREFIX || '.';
const tempDir = path.join(os.tmpdir(), 'silva-cache');
const port = process.env.PORT || 25680;
const pluginsDir = path.join(__dirname, 'plugins');
const logDir = path.join(__dirname, 'logs');

// ✅ OpenAI Configuration
const AI_PROVIDER = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini'], // fallback models
    headers: { 'Authorization': `Bearer ${config.OPENAI_API_KEY}` }
};

// Memory System
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

// Global Context Info
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

// Setup Directories
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Clean temp files periodically
setInterval(() => {
    fs.readdirSync(tempDir).forEach(file => fs.unlinkSync(path.join(tempDir, file)));
}, 5 * 60 * 1000);

// Logger Functions
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

// Load Plugins
let plugins = new Map();
function loadPlugins() {
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    plugins.clear();
    for (const file of files) {
        delete require.cache[require.resolve(path.join(pluginsDir, file))];
        const plugin = require(path.join(pluginsDir, file));
        plugins.set(file.replace('.js', ''), plugin);
    }
    logMessage('INFO', `✅ Loaded ${plugins.size} plugins`);
}
loadPlugins();

// Session Setup
async function setupSession() {
    const sessionPath = path.join(__dirname, 'sessions', 'creds.json');
    if (!fs.existsSync(sessionPath)) {
        if (!config.SESSION_ID || !config.SESSION_ID.startsWith('Silva~')) {
            throw new Error('Invalid or missing SESSION_ID. Must start with Silva~');
        }
        logMessage('INFO', '⬇ Downloading session from Mega.nz...');
        const megaCode = config.SESSION_ID.replace('Silva~', '');
        
        const mega = require('megajs');
        const file = mega.File.fromURL(`https://mega.nz/file/${megaCode}`);
        
        await new Promise((resolve, reject) => {
            file.download((err, data) => {
                if (err) {
                    logMessage('ERROR', `❌ Mega download failed: ${err.message}`);
                    return reject(err);
                }
                fs.mkdirSync(path.join(__dirname, 'sessions'), { recursive: true });
                fs.writeFileSync(sessionPath, data);
                logMessage('SUCCESS', '✅ Session downloaded and saved.');
                resolve();
            });
        });
    }
}

// ✅ AI Response Function (OpenAI Only)
async function getAIResponse(jid, userMessage) {
    try {
        const history = memoryManager.getConversation(jid);
        const messages = [
            {
                role: 'system',
                content: `You are Silva AI, a helpful WhatsApp assistant. Current date: ${new Date().toLocaleDateString()}.`
            },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: userMessage }
        ];

        let aiResponse;
        for (const model of AI_PROVIDER.models) {
            try {
                const response = await axios.post(AI_PROVIDER.endpoint, {
                    model,
                    messages,
                    max_tokens: 1500,
                    temperature: 0.7
                }, { headers: AI_PROVIDER.headers, timeout: 30000 });

                aiResponse = response.data.choices[0].message.content;
                break; // success
            } catch (error) {
                logMessage('WARN', `OpenAI model error: ${error.message}`);
            }
        }

        if (!aiResponse) throw new Error('All OpenAI models failed.');

        memoryManager.addMessage(jid, 'user', userMessage);
        memoryManager.addMessage(jid, 'assistant', aiResponse);

        return aiResponse;
    } catch (error) {
        logMessage('ERROR', `AI Failed: ${error.message}`);
        return "⚠️ Sorry, I'm unable to process your request right now.";
    }
}

// WhatsApp Connection
async function connectToWhatsApp() {
    try {
        await setupSession();
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
                if (statusCode === DisconnectReason.loggedOut) {
                    logMessage('CRITICAL', '❌ Session logged out. Please rescan QR code.');
                } else {
                    logMessage('INFO', 'Reconnecting...');
                    setTimeout(() => connectToWhatsApp(), 10000);
                }
            } else if (connection === 'open') {
                logMessage('SUCCESS', '✅ Connected to WhatsApp');
                global.botJid = sock.user.id;
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

// Express Server
const app = express();
app.get('/', (req, res) => res.send(`✅ ${config.BOT_NAME} is Running!`));
app.listen(port, () => logMessage('INFO', `🌐 Server running on port ${port}`));

// Start Bot
(async () => {
    try {
        logMessage('INFO', '🚀 Starting Silva AI WhatsApp Bot...');
        await connectToWhatsApp();
    } catch (e) {
        logMessage('CRITICAL', `Bot Init Failed: ${e.stack}`);
        setTimeout(() => connectToWhatsApp(), 5000);
    }
})(); 
