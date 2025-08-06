// ✅ Silva AI WhatsApp Bot - Complete Script (Fixed "thinking" + Insufficient Balance Error)
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
  externalAdReply: {
    title: `✦ ${config.BOT_NAME} ✦`,
    body: "Powered by DeepSeek & OpenAI",
    thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
    sourceUrl: "https://github.com/SilvaTechB/silva-md-bot",
    mediaType: 1,
    renderLargerThumbnail: true
  }
};

// Clean temp files periodically
setInterval(() => {
  fs.readdirSync(tempDir).forEach(file => fs.unlinkSync(path.join(tempDir, file)));
}, 5 * 60 * 1000);

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Logging
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

// AI Chat Function
async function getAIResponse(jid, userMessage) {
  try {
    const history = memoryManager.getConversation(jid);
    const messages = [
      { role: 'system', content: `You are Silva AI, a helpful WhatsApp assistant. Date: ${new Date().toLocaleDateString()}` },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userMessage }
    ];

    const provider = config.PREFERRED_AI === 'OPENAI' ? AI_PROVIDERS.OPENAI : AI_PROVIDERS.DEEPSEEK;

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
    const errMsg = error?.response?.data?.error?.message || error.message || 'Unknown error';
    logMessage('ERROR', `AI API Error: ${errMsg}`);
    if (errMsg.toLowerCase().includes('insufficient balance')) {
      return "⚠️ AI service temporarily disabled due to account limits. Please try again later.";
    }
    return "⚠️ AI service unavailable. Please try again later.";
  }
}

// WhatsApp Setup
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: P({ level: config.DEBUG ? 'debug' : 'silent' }),
    browser: Browsers.macOS('Safari'),
    auth: state,
    version
  });

  sock.ev.on('connection.update', async update => {
    if (update.connection === 'open') {
      logMessage('SUCCESS', '✅ Connected to WhatsApp');
    } else if (update.connection === 'close' && update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      logMessage('WARN', 'Reconnecting...');
      setTimeout(() => connectToWhatsApp(), 2000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m.message) return;

    const sender = m.key.remoteJid;
    if (isJidGroup(sender) && !config.GROUP_COMMANDS) return;

    const msgType = Object.keys(m.message)[0];
    const content = m.message[msgType]?.text || m.message[msgType]?.caption || m.message.conversation || '';
    if (!content) return;

    try {
      await sock.sendPresenceUpdate('composing', sender);
      const response = await getAIResponse(sender, content);
      await sock.sendMessage(sender, {
        text: response,
        contextInfo: globalContextInfo
      }, { quoted: m });
      logMessage('AI', `Response sent to ${sender}`);
    } catch (e) {
      logMessage('ERROR', `Failed to send AI response: ${e.message}`);
      await sock.sendMessage(sender, { text: "⚠️ AI error. Please try again later." });
    }
  });
}

// Express Server
const app = express();
app.get('/', (req, res) => res.send(`✅ ${config.BOT_NAME} is running.`));
app.listen(port, () => logMessage('INFO', `🌐 Web server started on port ${port}`));

// Start Bot
(async () => {
  try {
    logMessage('INFO', '🚀 Starting Silva AI Bot...');
    await connectToWhatsApp();
  } catch (e) {
    logMessage('CRITICAL', `Startup error: ${e.stack}`);
  }
})();
