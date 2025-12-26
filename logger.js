// Enhanced logging setup using Winston

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs-extra');
const config = require('./config');

// Ensure logs directory exists
fs.ensureDirSync(config.LOGS_DIR || './logs');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  levels,
  format: fileFormat,
  transports: [
    // Error log file
    new DailyRotateFile({
      filename: path.join('./logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
    }),

    // Combined log file
    new DailyRotateFile({
      filename: path.join('./logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
    }),

    // Ticket-specific log file
    new DailyRotateFile({
      filename: path.join('./logs', 'tickets-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
    }),

    // Game-specific log file
    new DailyRotateFile({
      filename: path.join('./logs', 'games-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: config.LOG_MAX_SIZE,
      maxFiles: config.LOG_MAX_FILES,
    }),
  ],
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Custom logging methods
logger.ticket = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'ticket' });
};

logger.game = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'game' });
};

logger.user = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'user' });
};

logger.performance = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'performance' });
};

logger.audit = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'audit' });
};

// Performance monitoring
const performanceMonitor = {
  start: (operation) => {
    return {
      operation,
      startTime: process.hrtime.bigint(),
      log: (additionalData = {}) => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - performanceMonitor.startTime) / 1000000; // Convert to milliseconds

        logger.performance(`Operation completed: ${operation}`, {
          duration,
          ...additionalData
        });

        return duration;
      }
    };
  }
};

// Request logging middleware helper
logger.logRequest = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000;

    logger.http(`${req.method} ${req.url}`, {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });

  next();
};

// Error logging helper
logger.logError = (error, context = {}) => {
  logger.error('An error occurred', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    ...context
  });
};

// Discord interaction logging
logger.logInteraction = (interaction, additionalData = {}) => {
  const logData = {
    userId: interaction.user?.id,
    username: interaction.user?.username,
    channelId: interaction.channel?.id,
    guildId: interaction.guild?.id,
    type: interaction.type,
    ...additionalData
  };

  if (interaction.isCommand()) {
    logger.info(`Slash command used: ${interaction.commandName}`, {
      ...logData,
      commandName: interaction.commandName,
      options: interaction.options.data
    });
  } else if (interaction.isButton()) {
    logger.info(`Button clicked: ${interaction.customId}`, {
      ...logData,
      customId: interaction.customId
    });
  } else if (interaction.isStringSelectMenu()) {
    logger.info(`Select menu used: ${interaction.customId}`, {
      ...logData,
      customId: interaction.customId,
      values: interaction.values
    });
  } else if (interaction.isModalSubmit()) {
    logger.info(`Modal submitted: ${interaction.customId}`, {
      ...logData,
      customId: interaction.customId
    });
  }
};

// Ticket lifecycle logging
logger.logTicketEvent = (event, ticketData) => {
  const messages = {
    created: `Ticket created: ${ticketData.ticketId}`,
    claimed: `Ticket claimed: ${ticketData.ticketId}`,
    closed: `Ticket closed: ${ticketData.ticketId}`,
    reopened: `Ticket reopened: ${ticketData.ticketId}`
  };

  logger.ticket(messages[event] || `Ticket event: ${event}`, ticketData);
};

// Game lifecycle logging
logger.logGameEvent = (event, gameData) => {
  const messages = {
    started: `Game started: ${gameData.gameId}`,
    ended: `Game ended: ${gameData.gameId}`,
    won: `Game won: ${gameData.gameId}`,
    lost: `Game lost: ${gameData.gameId}`,
    tied: `Game tied: ${gameData.gameId}`
  };

  logger.game(messages[event] || `Game event: ${event}`, gameData);
};

// User activity logging
logger.logUserActivity = (activity, userData) => {
  logger.user(`User activity: ${activity}`, userData);
};

// System health logging
logger.logSystemHealth = (metrics) => {
  logger.info('System health check', {
    category: 'system',
    ...metrics
  });
};

// Export both logger and performance monitor
module.exports = {
  logger,
  performanceMonitor
};
