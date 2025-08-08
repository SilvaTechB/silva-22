const { File: BufferFile } = require('node:buffer');
global.File = BufferFile;

// ✅ Silva Tech Inc Property 2025
const baileys = require('@whiskeysockets/baileys');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason, isJidGroup, isJidBroadcast, isJidStatusBroadcast, areJidsSameUser } = baileys;
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const P = require('pino');
const config = require('./config.js');

// OpenAI client
const { Configuration, OpenAIApi } = require('openai');
const openai = new OpenAIApi(new Configuration({
    apiKey: config.OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''
}));

const prefix = config.PREFIX || '.';
const tempDir = path.join(os.tmpdir(), 'silva-cache');
const port = process.env.PORT || 25680;
const pluginsDir = path.join(__dirname, 'plugins');

// ✅ Message Logger Setup
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

function getLogFileName() {
    const date = new Date();
    return `messages-${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.log`;
}

function logMessage(type, message) {
    if (!config.DEBUG && type === 'DEBUG') return;
    
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}\n`;
    
    // Log to console
    console.log(logEntry.trim());
    
    // Log to file
    const logFile = path.join(logDir, getLogFileName());
    fs.appendFileSync(logFile, logEntry);
}

// ✅ Global Context Info
const globalContextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363200367779016@newsletter',
        newsletterName: '◢◤ Silva Tech Inc ◢◤',
        serverMessageId: 144
    }
};

// ✅ Ensure Temp Directory Exists
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
setInterval(() => {
    try {
        fs.readdirSync(tempDir).forEach(file => {
            try { fs.unlinkSync(path.join(tempDir, file)); } catch(e) {}
        });
    } catch(e) {}
}, 5 * 60 * 1000);

// ✅ Load Plugins
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

// ✅ Setup Session from Mega.nz
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

// ✅ Generate Config Table
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

    for (const cfg of configs) {
        const paddedName = cfg.name.padEnd(24, ' ');
        const paddedValue = String(cfg.value).padEnd(9, ' ');
        table += `║ ${paddedName} ║ ${paddedValue} ║\n`;
    }

    table += '╚══════════════════════════╩═══════════╝';
    return table;
}

// ✅ Fancy Bio Generator
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

// ✅ Welcome Message with Config Status
async function sendWelcomeMessage(sock) {
    const configTable = generateConfigTable();
    
    const welcomeMsg = `*Hello ✦ ${config.BOT_NAME} ✦ User!*\n\n` +
        `✅ Silva MD Bot is now active!\n\n` +
        `*Prefix:* ${prefix}\n` +
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
                body: "Your bot is live with enhanced features!",
                thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
                sourceUrl: "https://github.com/SilvaTechB/silva-md-bot",
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    });
}

// ✅ Update Profile Status
async function updateProfileStatus(sock) {
    try {
        const bio = generateFancyBio();
        await sock.updateProfileStatus(bio);
        logMessage('SUCCESS', `✅ Bio updated: ${bio}`);
    } catch (err) {
        logMessage('ERROR', `❌ Failed to update bio: ${err.message}`);
    }
}

// ✅ Enhanced Group Message Handling
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

// -----------------------------
// ✅ AI Memory & Helpers
// -----------------------------
let chatMemory = {}; // { chatId: [{role, content, timestamp}] }
const MEMORY_EXPIRY = 48 * 60 * 60 * 1000; // 48 hours

function updateMemory(chatId, role, content) {
    if (!chatMemory[chatId]) chatMemory[chatId] = [];
    chatMemory[chatId].push({ role, content, timestamp: Date.now() });
    // Purge older than 48h
    chatMemory[chatId] = chatMemory[chatId].filter(m => (Date.now() - m.timestamp) <= MEMORY_EXPIRY);
}

// Periodic memory cleanup
setInterval(() => {
    const now = Date.now();
    for (const key of Object.keys(chatMemory)) {
        chatMemory[key] = chatMemory[key].filter(m => (now - m.timestamp) <= MEMORY_EXPIRY);
        if (chatMemory[key].length === 0) delete chatMemory[key];
    }
}, 60 * 60 * 1000); // hourly

// Build system prompt
function buildSystemPrompt() {
    return [
        {
            role: 'system',
            content: `You are Silva AI, developed by Silva Tech Inc. You are a modern conversational assistant similar to ChatGPT but branded as Silva AI. Your source code is hosted at https://github.com/SilvaTechB. For contact, use the following numbers: +254700143167, +254755257907, +254743706010. Always be helpful, concise, and polite. When answering, don't reveal internal mechanics or private logs. Prefer clarity and safety.`
        }
    ];
}

// Compose messages to send to OpenAI
function composeMessagesForOpenAI(chatId, incomingUserText) {
    const base = buildSystemPrompt();
    const memory = (chatMemory[chatId] || []).map(m => ({ role: m.role, content: m.content }));
    // Combine memory, then the new user message
    const messages = [
        ...base,
        ...memory,
        { role: 'user', content: incomingUserText }
    ];
    return messages;
}

// Send AI reply (and attach context info + externalAdReply)
async function sendAIReply(sock, to, quotedMessage, aiText) {
    try {
        await sock.sendMessage(to, {
            text: aiText,
            contextInfo: {
                ...globalContextInfo,
                externalAdReply: {
                    title: `Silva AI — Silva Tech Inc`,
                    body: "A modern conversational AI — 48h memory",
                    thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
                    sourceUrl: "https://github.com/SilvaTechB",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: quotedMessage });
    } catch (err) {
        logMessage('ERROR', `Failed to send AI reply: ${err.message}`);
    }
}

// -----------------------------
// ✅ Connect to WhatsApp
// -----------------------------
async function connectToWhatsApp() {
    await setupSession();
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'));
    const { version } = await fetchLatestBaileysVersion();

    const cryptoOptions = {
        maxSharedKeys: 1000,
        sessionThreshold: 0,
        cache: {
            TRANSACTION: false,
            PRE_KEYS: false
        }
    };

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
        ...cryptoOptions
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

    // Anti-Delete
    sock.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
            if (update.update.messageStubType === 7) {
                try {
                    const key = update.key;
                    const from = key.remoteJid;
                    const isGroup = isJidGroup(from);
                    
                    logMessage('EVENT', `Anti-Delete triggered in ${isGroup ? 'group' : 'private'}: ${from}`);
                    
                    if ((isGroup && config.ANTIDELETE_GROUP) || (!isGroup && config.ANTIDELETE_PRIVATE)) {
                        const deletedMessage = await sock.loadMessage(key);
                        if (!deletedMessage) {
                            logMessage('WARN', 'Could not load deleted message');
                            return;
                        }
                        
                        const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                        const sender = update.participant || key.participant || key.remoteJid;
                        const senderName = sender.split('@')[0];
                        
                        let caption = `⚠️ *Anti-Delete Alert!*\n\n` +
                            `👤 *Sender:* @${senderName}\n` +
                            `💬 *Restored Message:*\n\n` +
                            `*Chat:* ${isGroup ? 'Group' : 'Private'}`;
                        
                        let messageOptions = {
                            contextInfo: {
                                mentionedJid: [sender],
                                ...globalContextInfo,
                                externalAdReply: {
                                    title: "Silva MD Anti-Delete",
                                    body: "Message restored privately",
                                    thumbnailUrl: "https://files.catbox.moe/5uli5p.jpeg",
                                    sourceUrl: "https://github.com/SilvaTechB/silva-md-bot",
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        };
                        
                        let msgContent = '';
                        if (deletedMessage.message?.conversation) {
                            msgContent = deletedMessage.message.conversation;
                        } else if (deletedMessage.message?.extendedTextMessage) {
                            msgContent = deletedMessage.message.extendedTextMessage.text;
                        } else if (deletedMessage.message?.imageMessage) {
                            msgContent = '[Image] ' + (deletedMessage.message.imageMessage.caption || '');
                        } else if (deletedMessage.message?.videoMessage) {
                            msgContent = '[Video] ' + (deletedMessage.message.videoMessage.caption || '');
                        } else if (deletedMessage.message?.documentMessage) {
                            msgContent = '[Document] ' + (deletedMessage.message.documentMessage.fileName || '');
                        } else {
                            msgContent = '[Unsupported Type]';
                        }
                        
                        logMessage('INFO', `Restoring message: ${msgContent.substring(0, 100)}`);
                        
                        if (deletedMessage.message?.conversation) {
                            await sock.sendMessage(ownerJid, {
                                text: `${caption}\n\n${deletedMessage.message.conversation}`,
                                ...messageOptions
                            });
                        } else if (deletedMessage.message?.extendedTextMessage) {
                            await sock.sendMessage(ownerJid, {
                                text: `${caption}\n\n${deletedMessage.message.extendedTextMessage.text}`,
                                ...messageOptions
                            });
                        } else if (deletedMessage.message?.imageMessage) {
                            const buffer = await sock.downloadMediaMessage(deletedMessage);
                            await sock.sendMessage(ownerJid, {
                                image: buffer,
                                caption: `${caption}\n\n${deletedMessage.message.imageMessage.caption || ''}`,
                                ...messageOptions
                            });
                        } else if (deletedMessage.message?.videoMessage) {
                            const buffer = await sock.downloadMediaMessage(deletedMessage);
                            await sock.sendMessage(ownerJid, {
                                video: buffer,
                                caption: `${caption}\n\n${deletedMessage.message.videoMessage.caption || ''}`,
                                ...messageOptions
                            });
                        } else if (deletedMessage.message?.documentMessage) {
                            const buffer = await sock.downloadMediaMessage(deletedMessage);
                            await sock.sendMessage(ownerJid, {
                                document: buffer,
                                mimetype: deletedMessage.message.documentMessage.mimetype,
                                fileName: deletedMessage.message.documentMessage.fileName || 'Restored-File',
                                caption,
                                ...messageOptions
                            });
                        } else {
                            await sock.sendMessage(ownerJid, {
                                text: `${caption}\n\n[Unsupported Message Type]`,
                                ...messageOptions
                            });
                        }
                        
                        logMessage('SUCCESS', 'Anti-Delete message sent to owner');
                    }
                } catch (err) {
                    logMessage('ERROR', `Anti-Delete Error: ${err.message}`);
                }
            }
        }
    });

    // Auto Status handlers
    sock.ev.on('stat
