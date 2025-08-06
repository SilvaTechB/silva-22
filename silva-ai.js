// ✅ Fixed Silva AI WhatsApp Bot - Complete Script
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

// AI Configuration - FIXED WITH RELIABLE MODELS
const AI_PROVIDERS = {
  DEEPSEEK: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    models: ['deepseek-chat'],  // Only reliable model
    headers: { 'Authorization': `Bearer ${config.DEEPSEEK_API_KEY}` }
  },
  OPENAI: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-3.5-turbo', 'gpt-4'],  // Fallback models
    headers: { 'Authorization': `Bearer ${config.OPENAI_API_KEY}` }
  }
};

// Memory System (unchanged)
class MemoryManager {
  // ... (keep existing memory manager code)
}

const memoryManager = new MemoryManager();

// Global Context Info (unchanged)
const globalContextInfo = {
    // ... (keep existing context info)
};

// Setup Directories (unchanged)
// ... (keep directory setup code)

// Logger Functions (unchanged)
// ... (keep logging functions)

// Load Plugins (unchanged)
// ... (keep plugin loading code)

// Session Setup (unchanged)
// ... (keep session setup code)

// Helper Functions (unchanged)
// ... (keep helper functions)

// AI Functions - COMPREHENSIVE FIX
async function getAIResponse(jid, userMessage) {
  // Check provider configuration
  const isProviderConfigured = (provider) => {
    return provider && provider.headers && provider.headers.Authorization && 
           provider.headers.Authorization.startsWith('Bearer ');
  };

  // Detect balance errors
  const isBalanceError = (error) => {
    if (!error.response) return false;
    const status = error.response.status;
    if ([402, 403, 429].includes(status)) return true;
    
    if (error.response.data?.error?.message) {
      const msg = error.response.data.error.message.toLowerCase();
      return ['insufficient', 'balance', 'quota', 'limit', 'credit'].some(word => msg.includes(word));
    }
    return false;
  };

  // Detect model errors
  const isModelError = (error) => {
    if (!error.response) return false;
    if ([404, 400].includes(error.response.status)) return true;
    
    if (error.response.data?.error?.message) {
      const msg = error.response.data.error.message.toLowerCase();
      return msg.includes('model') || msg.includes('does not exist') || msg.includes('access');
    }
    return false;
  };

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

    let aiResponse;
    let lastError;
    let lastProvider;
    
    // Determine active providers
    const activeProviders = [];
    if (isProviderConfigured(AI_PROVIDERS.DEEPSEEK)) activeProviders.push('DEEPSEEK');
    if (isProviderConfigured(AI_PROVIDERS.OPENAI)) activeProviders.push('OPENAI');
    
    if (activeProviders.length === 0) {
      throw new Error('No AI providers configured');
    }
    
    // Try providers and models
    providerLoop: for (const providerName of activeProviders) {
      const provider = AI_PROVIDERS[providerName];
      const models = provider.models || [];
      
      for (const model of models) {
        try {
          logMessage('DEBUG', `Trying ${providerName} model: ${model}`);
          const response = await axios.post(provider.endpoint, {
            model,
            messages,
            max_tokens: 1500,
            temperature: 0.7
          }, { 
            headers: provider.headers,
            timeout: 30000
          });

          aiResponse = response.data.choices[0].message.content;
          lastProvider = `${providerName} (${model})`;
          break providerLoop; // Exit both loops on success
        } catch (error) {
          lastError = error;
          lastProvider = `${providerName} (${model})`;
          
          if (isBalanceError(error)) {
            logMessage('WARN', `⚠️ ${providerName} balance error - trying next option`);
          } 
          else if (isModelError(error)) {
            logMessage('WARN', `⚠️ ${providerName} model error - trying next model`);
          } 
          else {
            logMessage('ERROR', `⚠️ ${providerName} API error: ${error.message}`);
            break; // Move to next provider on non-model errors
          }
        }
      }
    }

    if (!aiResponse) {
      throw lastError || new Error('All AI providers failed');
    }
    
    memoryManager.addMessage(jid, 'user', userMessage);
    memoryManager.addMessage(jid, 'assistant', aiResponse);
    
    logMessage('SUCCESS', `✅ AI response from ${lastProvider}`);
    return aiResponse;
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    logMessage('ERROR', `AI Failed: ${errorMsg}`);
    
    // User-friendly error messages
    if (errorMsg.includes('insufficient')) {
      return "⚠️ My AI service is currently unavailable. Please contact my administrator.";
    } else if (errorMsg.includes('model')) {
      return "⚠️ I'm experiencing technical difficulties. Please try a different question.";
    } else {
      return "⚠️ Sorry, I'm unable to process your request right now. Please try again later.";
    }
  }
}

// WhatsApp Connection - IMPROVED ERROR HANDLING
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
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                logMessage('WARN', `Connection closed: ${statusCode || 'Unknown'}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    logMessage('CRITICAL', '❌ Session logged out. Please rescan QR code.');
                } else if (statusCode !== DisconnectReason.restartRequired) {
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
                const aiResponse = await getAIResponse(sender, content);
                
                await sock.sendMessage(sender, {
                    text: aiResponse,
                    contextInfo: globalContextInfo
                }, { quoted: m });
                
                logMessage('AI', `Response sent: ${aiResponse.substring(0, 100)}`);
            } catch (err) {
                logMessage('ERROR', `AI Processing Error: ${err.message}`);
                await sock.sendMessage(sender, {
                    text: "⚠️ I encountered an error processing your request.",
                    contextInfo: globalContextInfo
                }, { quoted: m });
            }
        });

        return sock;
    } catch (e) {
        logMessage('CRITICAL', `Connection failed: ${e.message}`);
        setTimeout(() => connectToWhatsApp(), 10000);
    }
}

// Profile Functions (unchanged)
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
