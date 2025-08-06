const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}

module.exports = {
    // Core Configuration
    SESSION_ID: process.env.SESSION_ID || "Silva~YOUR_MEGA_SESSION_CODE",
    PREFIX: process.env.PREFIX || ".",
    BOT_NAME: process.env.BOT_NAME || "✦ Silva AI ✦",
    DESCRIPTION: process.env.DESCRIPTION || "Advanced AI WhatsApp Assistant with Memory Capabilities",
    MODE: process.env.MODE || "both", // both, public, or private
    
    // AI Configuration
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "sk-904c57a88e754efea242835ef55e78bc",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "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",
    PREFERRED_AI: process.env.PREFERRED_AI || "DEEPSEEK", // DEEPSEEK or OPENAI
    MAX_HISTORY: process.env.MAX_HISTORY || 100, // Conversation memory length
    
    // Owner Information
    OWNER_NUMBER: process.env.OWNER_NUMBER || "254700143167",
    OWNER_NAME: process.env.OWNER_NAME || "Silva Tech",
    
    // Media URLs
    ALIVE_IMG: process.env.ALIVE_IMG || "https://files.catbox.moe/5uli5p.jpeg",
    LOGO_IMG: process.env.LOGO_IMG || "https://files.catbox.moe/5uli5p.jpeg",
    BOT_AVATAR: process.env.BOT_AVATAR || "https://files.catbox.moe/5uli5p.jpeg",
    
    // Auto-Response Settings
    LIVE_MSG: process.env.LIVE_MSG || "⚡ *Silva AI is active and ready to assist you!*",
    AUTO_STATUS_MSG: process.env.AUTO_STATUS_MSG || "👀 Seen by Silva AI",
    AUTO_REPLY: convertToBool(process.env.AUTO_REPLY, "true"),
    READ_MESSAGE: convertToBool(process.env.READ_MESSAGE, "true"),
    
    // Reaction Settings
    AUTO_STATUS_REACT: convertToBool(process.env.AUTO_STATUS_REACT, "true"),
    CUSTOM_REACT: convertToBool(process.env.CUSTOM_REACT, "true"),
    CUSTOM_REACT_EMOJIS: process.env.CUSTOM_REACT_EMOJIS || "💖,❤️,🔥,🌟,🤖,👀,⚡",
    AUTO_REACT_NEWSLETTER: convertToBool(process.env.AUTO_REACT_NEWSLETTER, "true"),
    OWNER_REACT: convertToBool(process.env.OWNER_REACT, "true"),
    HEART_REACT: convertToBool(process.env.HEART_REACT, "false"),
    
    // Status Settings
    AUTO_STATUS_SEEN: convertToBool(process.env.AUTO_STATUS_SEEN, "true"),
    AUTO_STATUS_REPLY: convertToBool(process.env.AUTO_STATUS_REPLY, "true"),
    
    // Media Handling
    AUTO_VOICE: convertToBool(process.env.AUTO_VOICE, "false"),
    AUTO_STICKER: convertToBool(process.env.AUTO_STICKER, "false"),
    AUTO_TYPING: convertToBool(process.env.AUTO_TYPING, "true"),
    AUTO_RECORDING: convertToBool(process.env.AUTO_RECORDING, "false"),
    
    // Security Settings
    ANTI_LINK: convertToBool(process.env.ANTI_LINK, "true"),
    DELETE_LINKS: convertToBool(process.env.DELETE_LINKS, "false"),
    ANTI_BAD: convertToBool(process.env.ANTI_BAD, "false"),
    
    // Anti-Delete Settings
    ANTIDELETE_GROUP: convertToBool(process.env.ANTIDELETE_GROUP, "true"),
    ANTIDELETE_PRIVATE: convertToBool(process.env.ANTIDELETE_PRIVATE, "true"),
    
    // Performance Settings
    ALWAYS_ONLINE: convertToBool(process.env.ALWAYS_ONLINE, "true"),
    GROUP_COMMANDS: convertToBool(process.env.GROUP_COMMANDS, "true"),
    
    // Debug Settings
    DEBUG: convertToBool(process.env.DEBUG, "false"),
    
    // Plugin Settings
    PLUGINS_ENABLED: convertToBool(process.env.PLUGINS_ENABLED, "true")
};
