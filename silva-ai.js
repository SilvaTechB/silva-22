 
// ✅ Silva AI WhatsApp Bot - Complete Script
const { File: BufferFile } = require('node:buffer');
global.File = BufferFile;

const baileys = require('@whiskeysockets/baileys');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason, isJidGroup, isJidBroadcast, isJidStatusBroadcast } = baileys;
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

// AI Configuration
const AI_PROVIDERS = {
  DEEPSEEK: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    headers: { 'Authorization': `Bearer ${config.DEEPSEEK_API_KEY}` }
  },
  OPENAI: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4-turbo',
    headers: { 'Authorization': `Bearer ${config.OPENAI_API_KEY}` }
  }
};

// Memory System
class MemoryManager {
  constructor() {
    this.memoryPath = path.join(__dirname, 'conversation_memory.json');
    this.conversations = this.loadMemory();
    this.maxHistory = config.MAX_HISTORY || 10;
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
        body: "Powered by DeepSeek & OpenAI",
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

// Helper Functions
function generateConfigTable() {
    const configs = [
        { name: 'MODE', value: config.MODE },
        { name: 'ANTIDELETE_GROUP', value: config.ANTIDELETE_GROUP },
        { name: 'ANTIDELETE_PRIVATE', value: config.ANTIDELETE_PRIVATE },
        { name: 'AUTO_STATUS_SEEN', value: config.AUTO_STATUS_SEEN },
        { name: 'AUTO_STATUS_REACT', value: config.AUTO_STATUS_REACT },
        { name: 'AUTO_STATUS_REPLY', value: config.AUTO_STATUS_REPLY },
        { name: 'AUTO_REACT_NEWSLETTER', value: config.AUTO_REACT_NEWSLETTER },
        { name: 'ANTI_LINK', value: config.ANTI_LINK },
        { name: 'ALWAYS_ONLINE', value: config.ALWAYS_ONLINE },
        { name: 'GROUP_COMMANDS', value: config.GROUP_COMMANDS }
    ];

    let table = '╔══════════════════════════╦═══════════╗\n';
    table += '║        Config Name       ║   Value   ║\n';
    table += '╠══════════════════════════╬═══════════╣\n';

    for (const config of configs) {
        const paddedName = config.name.padEnd(24, ' ');
        const paddedValue = String(config.value).padEnd(9, ' ');
        table += `║ ${paddedName} ║ ${paddedValue} ║\n`;
    }

    table += '╚══════════════════════════╩═══════════╝';
    return table;
}

function generateFancyBio() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-KE', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    const timeStr = now.toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    
    const bios = [
        `✨ ${config.BOT_NAME} ✦ Online ✦ ${dateStr} ✦`,
        `⚡ Silva MD Active ✦ ${timeStr} ✦ ${dateStr} ✦`,
        `💫 ${config.BOT_NAME} Operational ✦ ${dateStr} ✦`,
        `🚀 Silva MD Live ✦ ${dateStr} ✦ ${timeStr} ✦`,
        `🌟 ${config.BOT_NAME} Running ✦ ${dateStr} ✦`
    ];
    
    return bios[Math.floor(Math.random() * bios.length)];
}

function isBotMentioned(message, botJid) {
    if (!message || !botJid) return false;
    
    if (message.extendedTextMessage) {
        const mentionedJids = message.extendedTextMessage.contextInfo?.mentionedJid || [];
        return mentionedJids.includes(botJid);
    }
    
    if (message.conversation) {
        const botNumber = botJid.split('@')[0];
        return message.conversation.includes(`@${botNumber}`);
    }
    
    return false;
}

// AI Functions
async function getAIResponse(jid, userMessage) {
  try {
    const history = memoryManager.getConversation(jid);
    
    const messages = [
      {
        role: 'system',
        content: `You are Silva AI, a helpful WhatsApp assistant. Current date: ${new Date().toLocaleDateString()}. ` +
                 `User's name: ${jid.split('@')[0]}. Respond conversationally.`
      },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userMessage }
    ];

    const provider = config.PREFERRED_AI === 'OPENAI' ? 
      AI_PROVIDERS.OPENAI : AI_PROVIDERS.DEEPSEEK;

    const response = await axios.post(provider.endpoint, {
      model: provider.model,
      messages,
      max_tokens: 1500,
      temperature: 0.7
    }, { headers: provider.headers });

    const aiResponse = response.data.choices[0].message.content;
    
    memoryManager.addMessage(jid, 'user', userMessage);
    memoryManager.addMessage(jid, 'assistant', aiResponse);
    
    return aiResponse;
  } catch (error) {
    console.error('AI Error:', error.response?.data || error.message);
    return "⚠️ Sorry, I'm having trouble thinking right now. Please try again later.";
  }
}

// WhatsApp Connection
async function connectToWhatsApp() {
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
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
        maxSharedKeys: 1000,
        sessionThreshold: 0,
        cache: {
            TRANSACTION: false,
            PRE_KEYS: false
        }
    });

    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            logMessage('WARN', `Connection closed: ${lastDisconnect?.error?.output?.statusCode || 'Unknown'}`);
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                logMessage('INFO', 'Reconnecting...');
                setTimeout(() => connectToWhatsApp(), 2000);
            }
        } else if (connection === 'open') {
            logMessage('SUCCESS', '✅ Connected to WhatsApp');
            global.botJid = sock.user.id;
            await updateProfileStatus(sock);
            await sendWelcomeMessage(sock);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Message Handling
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        const m = messages[0];
        if (!m.message) return;

        const sender = m.key.remoteJid;
        const isGroup = isJidGroup(sender);
        const isNewsletter = sender.endsWith('@newsletter');
        
        // Log incoming message
        logMessage('MESSAGE', `New ${isNewsletter ? 'newsletter' : isGroup ? 'group' : 'private'} message from ${sender}`);
        
        // Auto-react to newsletter messages
        if (isNewsletter && config.AUTO_REACT_NEWSLETTER) {
            try {
                await sock.sendMessage(sender, {
                    react: {
                        text: '🤖',
                        key: m.key
                    }
                });
            } catch (e) {
                logMessage('ERROR', `Newsletter react failed: ${e.message}`);
            }
        }
        
        // Skip processing if group commands are disabled
        if (isGroup && !config.GROUP_COMMANDS) return;
        
        // Extract content
        const messageType = Object.keys(m.message)[0];
        let content = '';
        let isMentioned = false;
        
        if (messageType === 'conversation') {
            content = m.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            content = m.message.extendedTextMessage.text || '';
            if (isGroup && global.botJid) {
                isMentioned = isBotMentioned(m.message, global.botJid);
            }
        } else if (messageType === 'imageMessage') {
            content = m.message.imageMessage.caption || '';
        } else if (messageType === 'videoMessage') {
            content = m.message.videoMessage.caption || '';
        } else if (messageType === 'documentMessage') {
            content = m.message.documentMessage.caption || '';
        } else {
            return;
        }
        
        // Always respond in private chats, in groups only when mentioned
        const shouldRespond = !isGroup || (isGroup && isMentioned);
        if (!shouldRespond) return;
        
        // If mentioned, remove mention from content
        if (isMentioned) {
            const botNumber = global.botJid.split('@')[0];
            content = content.replace(new RegExp(`@${botNumber}\\s*`, 'i'), '').trim();
        }
        
        // Handle AI Response
        if (config.READ_MESSAGE) await sock.readMessages([m.key]);
        
        try {
            await sock.sendPresenceUpdate('composing', sender);
            const aiResponse = await getAIResponse(sender, content);
            
            await sock.sendMessage(sender, {
                text: aiResponse,
                contextInfo: globalContextInfo
            }, { quoted: m });
            
            logMessage('AI', `Response sent: ${aiResponse.substring(0, 100)}`);
        } catch (err) {
            logMessage('ERROR', `AI Processing Error: ${err.message}`);
            await sock.sendMessage(sender, {
                text: "⚠️ Sorry, I encountered an error processing your request.",
                contextInfo: globalContextInfo
            }, { quoted: m });
        } finally {
            await sock.sendPresenceUpdate('paused', sender);
        }
    });

    return sock;
}

// Profile Functions
async function updateProfileStatus(sock) {
    try {
        const bio = generateFancyBio();
        await sock.updateProfileStatus(bio);
        logMessage('SUCCESS', `✅ Bio updated: ${bio}`);
    } catch (err) {
        logMessage('ERROR', `❌ Failed to update bio: ${err.message}`);
    }
}

async function sendWelcomeMessage(sock) {
    const configTable = generateConfigTable();
    
    const welcomeMsg = `*Hello ✦ ${config.BOT_NAME} ✦ User!*\n\n` +
        `✅ Silva AI Bot is now active!\n\n` +
        `*Mode:* ${config.MODE}\n` +
        `*Plugins Loaded:* ${plugins.size}\n\n` +
        `*⚙️ Configuration Status:*\n\`\`\`${configTable}\`\`\`\n\n` +
        `*Description:* ${config.DESCRIPTION}\n\n` +
        `⚡ Powered by Silva Tech Inc\nGitHub: https://github.com/SilvaTechB/silva-md-bot`;

    await sock.sendMessage(sock.user.id, {
        image: { url: config.ALIVE_IMG },
        caption: welcomeMsg,
        contextInfo: {
            ...globalContextInfo,
            externalAdReply: {
                title: `✦ ${config.BOT_NAME} ✦ Official`,
                body: "Your AI assistant is ready!",
                thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
                sourceUrl: "https://github.com/SilvaTechB/silva-md-bot",
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    });
}

// Express Server
const app = express();
app.get('/', (req, res) => res.send(`✅ ${config.BOT_NAME} is Running!`));
app.listen(port, () => logMessage('INFO', `🌐 Server running on port ${port}`));

// Error Handling
process.on('uncaughtException', (err) => {
    logMessage('CRITICAL', `Uncaught Exception: ${err.stack}`);
    setTimeout(() => connectToWhatsApp(), 5000);
});

process.on('unhandledRejection', (reason, promise) => {
    logMessage('CRITICAL', `Unhandled Rejection: ${reason} at ${promise}`);
});

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
