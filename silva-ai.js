// ✅ Silva AI WhatsApp Bot - With Delayed Responses
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
const Bottleneck = require('bottleneck');
const config = require('./config.js');

// Constants
const prefix = config.PREFIX || '.';
const tempDir = path.join(os.tmpdir(), 'silva-cache');
const port = process.env.PORT || 25680;
const pluginsDir = path.join(__dirname, 'plugins');
const logDir = path.join(__dirname, 'logs');
const RESPONSE_DELAY = 15000; // 15 seconds delay

// ✅ OpenAI Configuration
const AI_PROVIDER = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.5', 'o1', 'o1-mini', 'o3', 'o4-mini'], // fallback models
    headers: { 'Authorization': `Bearer ${config.OPENAI_API_KEY}` }
};

// Rate Limiter Configuration
const openaiLimiter = new Bottleneck({
  minTime: 2000, // minimum time between requests (2 seconds)
  maxConcurrent: 1, // only 1 request at a time
  reservoir: 3, // initial number of requests allowed
  reservoirRefreshAmount: 3, // number of requests added per refresh
  reservoirRefreshInterval: 60 * 1000, // refresh interval (1 minute)
});

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

// ✅ Enhanced AI Response Function with Delay
async function getAIResponse(jid, userMessage) {
    try {
        // Add artificial delay before processing
        await new Promise(resolve => setTimeout(resolve, RESPONSE_DELAY));

        const history = memoryManager.getConversation(jid);
        const messages = [
            {
                role: 'system',
                content: `You are Silva AI, developed by Silva Tech Inc. You are a modern conversational assistant similar to advanced or premium chatgpt but branded as Silva AI. Your source code is hosted at https://github.com/SilvaTechB. For contact, use the following numbers: +254700143167, +254755257907, +254743706010. Always be helpful, concise, and polite. When answering, don't reveal internal mechanics or private logs. Prefer clarity and safety. Current date: ${new Date().toLocaleDateString()}.`
            },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: userMessage }
        ];

        let aiResponse;
        let lastError;
        
        for (const model of AI_PROVIDER.models) {
            try {
                const response = await openaiLimiter.schedule(() => 
                    axios.post(AI_PROVIDER.endpoint, {
                        model,
                        messages,
                        max_tokens: 1500,
                        temperature: 0.7
                    }, { 
                        headers: AI_PROVIDER.headers,
                        timeout: 30000
                    })
                );

                aiResponse = response.data.choices[0].message.content;
                break; // success
            } catch (error) {
                lastError = error;
                logMessage('WARN', `OpenAI model error (${model}): ${error.message}`);
                
                // If rate limited, wait before trying next model
                if (error.response?.status === 429) {
                    const retryAfter = error.response.headers['retry-after'] || 20;
                    logMessage('INFO', `⏳ Rate limited - waiting ${retryAfter} seconds`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                }
            }
        }

        if (!aiResponse) {
            throw lastError || new Error('All OpenAI models failed.');
        }

        memoryManager.addMessage(jid, 'user', userMessage);
        memoryManager.addMessage(jid, 'assistant', aiResponse);

        return aiResponse;
    } catch (error) {
        logMessage('ERROR', `AI Failed: ${error.message}`);
        return "⚠️ I'm currently processing many requests. Please wait a moment and try again.";
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

            // Skip if group commands disabled
            if (isGroup && !config.GROUP_COMMANDS) return;

            const messageType = Object.keys(m.message)[0];
            let content = '';
            if (messageType === 'conversation') content = m.message.conversation;
            else if (messageType === 'extendedTextMessage') content = m.message.extendedTextMessage.text || '';
            else if (messageType === 'imageMessage') content = m.message.imageMessage.caption || '';
            else if (messageType === 'videoMessage') content = m.message.videoMessage.caption || '';

            if (!content) return;

            try {
                // Process message and get response
                const aiResponse = await getAIResponse(sender, content);
                
                // Send response
                await sock.sendMessage(
                    sender, 
                    { text: aiResponse, contextInfo: globalContextInfo }, 
                    { quoted: m }
                );
                
                // Mark as read only after responding
                if (config.READ_MESSAGE) {
                    await sock.readMessages([m.key]);
                }
            } catch (err) {
                logMessage('ERROR', `AI Processing Error: ${err.message}`);
                await sock.sendMessage(
                    sender, 
                    { text: "⚠️ I'm currently processing your request. Please wait...", contextInfo: globalContextInfo }, 
                    { quoted: m }
                );
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
