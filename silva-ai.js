// ✅ Silva AI WhatsApp Bot - Optimized Script
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

// Constants and Configurations
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

  // ... [rest of MemoryManager implementation]
}

const memoryManager = new MemoryManager();

// Improved Error Handling
async function getAIResponse(jid, userMessage) {
  try {
    const history = memoryManager.getConversation(jid);
    const provider = config.PREFERRED_AI === 'OPENAI' ? AI_PROVIDERS.OPENAI : AI_PROVIDERS.DEEPSEEK;

    const response = await axios.post(provider.endpoint, {
      model: provider.model,
      messages: [
        {
          role: 'system',
          content: `You are Silva AI, a helpful WhatsApp assistant. Current date: ${new Date().toLocaleDateString()}.`
        },
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: userMessage }
      ],
      max_tokens: 1500,
      temperature: 0.7
    }, { 
      headers: provider.headers,
      timeout: 10000 // 10 second timeout
    });

    const aiResponse = response.data.choices[0].message.content;
    memoryManager.addMessage(jid, 'assistant', aiResponse);
    return aiResponse;
  } catch (error) {
    console.error('AI Error:', error.message);
    return null; // Return null instead of error message
  }
}

// Message Processing
async function processMessage(sock, m) {
  const sender = m.key.remoteJid;
  const isGroup = isJidGroup(sender);
  
  // Extract message content
  let content = '';
  const messageType = Object.keys(m.message)[0];
  
  if (messageType === 'conversation') {
    content = m.message.conversation;
  } else if (messageType === 'extendedTextMessage') {
    content = m.message.extendedTextMessage?.text || '';
  } else if (['imageMessage', 'videoMessage', 'documentMessage'].includes(messageType)) {
    content = m.message[messageType]?.caption || '';
  }

  // Only respond if not a group or mentioned in group
  const shouldRespond = !isGroup || isBotMentioned(m.message, global.botJid);
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
    // No response if AI fails (null returned)
  } catch (err) {
    console.error('Message processing error:', err);
  } finally {
    await sock.sendPresenceUpdate('paused', sender);
  }
}

// Main WhatsApp Connection
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: P({ level: config.DEBUG ? 'debug' : 'silent' }),
    auth: state,
    version,
    markOnlineOnConnect: true
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      await Promise.all(messages.map(m => processMessage(sock, m)));
    } catch (err) {
      console.error('Message processing error:', err);
    }
  });

  // ... [rest of connection setup]
}

// Start the bot
(async () => {
  try {
    await connectToWhatsApp();
  } catch (e) {
    console.error('Bot startup error:', e);
    setTimeout(() => connectToWhatsApp(), 5000);
  }
})();
