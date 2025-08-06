// ✅ Silva AI WhatsApp Bot - Complete Optimized Script
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

// Enhanced Memory System
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

// AI Response Handler
async function getAIResponse(jid, userMessage) {
  try {
    const history = memoryManager.getConversation(jid);
    const provider = config.PREFERRED_AI === 'OPENAI' ? AI_PROVIDERS.OPENAI : AI_PROVIDERS.DEEPSEEK;

    const response = await axios.post(provider.endpoint, {
      model: provider.model,
      messages: [
        {
          role: 'system',
          content: `You are Silva AI, a helpful WhatsApp assistant. Current date: ${new Date().toLocaleDateString()}. ` +
                   `User's name: ${jid.split('@')[0]}. Respond conversationally.`
        },
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: userMessage }
      ],
      max_tokens: 1500,
      temperature: 0.7
    }, { 
      headers: provider.headers,
      timeout: 10000
    });

    const aiResponse = response.data.choices[0].message.content;
    memoryManager.addMessage(jid, 'user', userMessage);
    memoryManager.addMessage(jid, 'assistant', aiResponse);
    return aiResponse;
  } catch (error) {
    console.error('AI Error:', error.message);
    return null;
  }
}

// Message Processing
async function processMessage(sock, m) {
  if (!m.message) return;

  const sender = m.key.remoteJid;
  const isGroup = isJidGroup(sender);
  
  let content = '';
  const messageType = Object.keys(m.message)[0];
  
  if (messageType === 'conversation') {
    content = m.message.conversation;
  } else if (messageType === 'extendedTextMessage') {
    content = m.message.extendedTextMessage?.text || '';
  } else if (['imageMessage', 'videoMessage', 'documentMessage'].includes(messageType)) {
    content = m.message[messageType]?.caption || '';
  }

  const shouldRespond = !isGroup || (isGroup && isBotMentioned(m.message, global.botJid));
  if (!shouldRespond || !content.trim()) return;

  try {
    await sock.sendPresenceUpdate('composing', sender);
    const aiResponse = await getAIResponse(sender, content);
    
    if (aiResponse) {
      await sock.sendMessage(sender, {
        text: aiResponse,
        contextInfo: globalContextInfo
      }, { quoted: m });
    }
  } catch (err) {
    console.error('Message processing error:', err);
  } finally {
    await sock.sendPresenceUpdate('paused', sender);
  }
}

// WhatsApp Connection
async function connectToWhatsApp() {
    await setupSession();
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: P({ level: config.DEBUG ? 'debug' : 'silent' }),
        printQRInTerminal: true,
        browser: Browsers.macOS('Safari'),
        auth: state,
        version,
        markOnlineOnConnect: config.ALWAYS_ONLINE,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined
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
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            await Promise.all(messages.map(m => processMessage(sock, m)));
        } catch (err) {
            logMessage('ERROR', `Message processing error: ${err.message}`);
        }
    });

    return sock;
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
