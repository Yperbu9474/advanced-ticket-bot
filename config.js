// Configuration file for the Discord Ticket Bot
// All configuration constants are centralized here
// Sensitive data should be set via environment variables

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'GUILD_ID', 'TICKET_CATEGORY_ID', 'TICKET_CHANNEL_ID', 'STAFF_ROLES'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

module.exports = {
  // Discord Bot Configuration
  TOKEN: process.env.DISCORD_TOKEN,
  GUILD_ID: process.env.GUILD_ID,

  // Channel IDs (set these in your .env file)
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID,
  TICKET_CHANNEL_ID: process.env.TICKET_CHANNEL_ID,
  OPEN_LOG_CHANNEL_ID: process.env.OPEN_LOG_CHANNEL_ID,
  CLOSE_LOG_CHANNEL_ID: process.env.CLOSE_LOG_CHANNEL_ID,
  STAR_LOG_CHANNEL_ID: process.env.STAR_LOG_CHANNEL_ID,
  // Optional: global star log channel ID to post all ratings to one place
  STAR_LOG_GLOBAL_ID: process.env.STAR_LOG_GLOBAL_ID,

  // Bot Status Configuration
  BOT_STATUSES: ['dev : _ury1', 'MSK HUB TICKET'],
  STATUS_UPDATE_INTERVAL: 3000, // 3 seconds

  // Game Configuration
  GAME_TIMEOUT: 300000, // 5 minutes for number guessing
  MATH_TIMEOUT: 30000, // 30 seconds for math challenges

  // Ticket Configuration
  TICKET_CLOSE_DELAY: 5000, // 5 seconds before deleting channel
  GAME_OFFER_DELAY: 3000, // 3 seconds after ticket creation
  // Auto-assign tickets to least-busy staff when true
  AUTO_ASSIGN_TICKETS: false,
  // Dry run mode: when true the bot will not login to Discord (useful for testing)
  DRY_RUN: false,

  // Rate Limiting
  TICKET_RATE_LIMIT: {
    WINDOW_MS: 60000, // 1 minute
    MAX_REQUESTS: 3 // Max 3 tickets per minute per user
  },

  GAME_RATE_LIMIT: {
    WINDOW_MS: 10000, // 10 seconds
    MAX_REQUESTS: 5 // Max 5 game interactions per 10 seconds
  },

  // Database Configuration
  DATABASE_PATH: './data/ticketbot.db',

  // Logging Configuration
  LOG_LEVEL: 'info',
  LOG_MAX_SIZE: '20m',
  LOG_MAX_FILES: 5,

  // Analytics Configuration
  ANALYTICS_RETENTION_DAYS: 30,

  // Embed Colors
  EMBED_COLOR: 0x574d3c,
  SUCCESS_COLOR: 0x00ff00,
  ERROR_COLOR: 0xff0000,
  WARNING_COLOR: 0xffff00,

  // Emojis (use standard emojis or your custom ones)
  EMOJIS: {
    TICKET: '🎫',
    SUPPORT: '🛠️',
    LIGHT_BULB: '💡',
    THUNDER: '⚡',
    BY_NOOBOT: '🤖',
    PIN: '📌',
    MSK: '🏷️',
    SUPPORT_ICON: '🆘',
    TOOLS: '🔧',
    WARN: '⚠️',
    EMBASSADOR: '👑'
  },

  // Staff Role IDs (for ticket management) - set in .env as comma-separated values
  STAFF_ROLES: process.env.STAFF_ROLES ? process.env.STAFF_ROLES.split(',') : [],

  // Ticket Priorities
  PRIORITIES: {
    LOW: { name: 'Low', color: 0x00ff00, emoji: '🟢' },
    NORMAL: { name: 'Normal', color: 0x574d3c, emoji: '🟡' },
    HIGH: { name: 'High', color: 0xffa500, emoji: '🟠' },
    URGENT: { name: 'Urgent', color: 0xff0000, emoji: '🔴' }
  },

  // Game Settings
  GAMES: {
    TICTACTOE: {
      BOARD_SIZE: 3,
      AI_DIFFICULTY: 'hard' // easy, normal, hard
    },
    MATH: {
      DIFFICULTIES: {
        easy: { range: 10 },
        normal: { range: 50 },
        hard: { range: 100, includeMultiplication: true }
      }
    },
    GUESSING: {
      RANGE: { min: 1, max: 100 },
      MAX_ATTEMPTS: 7
    },
    ROCKPAPERSCISSORS: {
      CHOICES: ['rock', 'paper', 'scissors']
    },
    TRIVIA: {
      QUESTIONS_PER_GAME: 5,
      TIME_PER_QUESTION: 15000 // 15 seconds
    },
    HANGMAN: {
      MAX_WRONG_GUESSES: 6,
      WORD_LENGTH_MIN: 4,
      WORD_LENGTH_MAX: 12
    }
  },

  // File Upload Configuration
  MAX_FILE_SIZE: 8 * 1024 * 1024, // 8MB
  ALLOWED_FILE_TYPES: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain',
    'application/zip', 'application/x-rar-compressed'
  ],

  // Backup Configuration
  BACKUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  BACKUP_RETENTION: 7, // Keep 7 days of backups

  // Performance Monitoring
  PERFORMANCE_LOG_INTERVAL: 60000, // 1 minute
  SLOW_RESPONSE_THRESHOLD: 5000 // 5 seconds
};
