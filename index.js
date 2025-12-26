const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Auto-install dependencies function
async function autoInstallDependencies() {
  console.log('🔍 Checking dependencies...');

  const requiredPackages = ['discord.js', 'better-sqlite3', 'node-cron'];
  const packageJsonPath = path.join(__dirname, 'package.json');

  try {
    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      console.log('📦 Creating package.json...');
      const packageJson = {
        "name": "discord-ticket-bot",
        "version": "1.0.0",
        "description": "Discord Ticket Support Bot with Mini-Games",
        "main": "index.js",
        "scripts": {
          "start": "node index.js"
        },
        "dependencies": {
          "discord.js": "^14.22.1",
          "better-sqlite3": "^9.4.3",
          "node-cron": "^3.0.3"
        },
        "engines": {
          "node": ">=18.0.0"
        }
      };
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    // Check if node_modules exists
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('📥 Installing dependencies...');
      execSync('npm install', { stdio: 'inherit' });
    } else {
      // Check if required packages are installed
      let needsInstall = false;
      for (const pkg of requiredPackages) {
        const pkgPath = path.join(nodeModulesPath, pkg);
        if (!fs.existsSync(pkgPath)) {
          console.log(`❌ Missing package: ${pkg}`);
          needsInstall = true;
        }
      }

      if (needsInstall) {
        console.log('📥 Installing missing dependencies...');
        execSync('npm install', { stdio: 'inherit' });
      }
    }

    console.log('✅ All dependencies are ready!');
  } catch (error) {
    console.error('❌ Error during dependency installation:', error.message);
    console.log('🔄 Trying to continue anyway...');
  }
}

// Run auto-install before importing discord.js
autoInstallDependencies();

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const cron = require('node-cron');

// Import our modular components
const config = require('./config');
const utils = require('./utils');
const Database = require('./models/database');
const Ticket = require('./models/ticket');
const User = require('./models/user');
const Analytics = require('./models/analytics');
const { logger } = require('./logger');
const InteractionHandler = require('./handlers/interactionHandler');
const TicketHandler = require('./handlers/ticketHandler');
const GameHandler = require('./handlers/gameHandler');
const AdminHandler = require('./handlers/adminHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Initialize handlers
let interactionHandler;
let ticketHandler;
let gameHandler;
let adminHandler;

// Bot status rotation
let statusIndex = 0;
const statuses = ['dev : _ury1', 'MSK HUB TICKET'];

function updateBotStatus() {
  client.user.setActivity(statuses[statusIndex], { type: 0 }); // 0 = PLAYING
  statusIndex = (statusIndex + 1) % statuses.length;
}

client.once('ready', async () => {
  console.log(`🎟️ Ticket Support Bot is online as ${client.user.tag}!`);

  // Initialize database
  await Database.connect();

  // Initialize handlers
  interactionHandler = new InteractionHandler(client);
  ticketHandler = new TicketHandler(client);
  gameHandler = new GameHandler(client);
  adminHandler = new AdminHandler(client);

  // Start status rotation
  updateBotStatus();
  setInterval(updateBotStatus, 3000); // Change every 3 seconds

  // Register slash commands
  await registerSlashCommands();

  // Auto-send ticket panel
  await sendTicketPanel();

  // Schedule cleanup tasks
  scheduleCleanupTasks();

  logger.info('Bot initialization complete', {
    guilds: client.guilds.cache.size,
    users: client.users.cache.size,
    channels: client.channels.cache.size
  });
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isCommand()) {
      await handleSlashCommands(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    }
  } catch (error) {
    logger.logError(error, { context: 'Interaction handling', interactionType: interaction.type });

    const errorMessage = {
      content: '❌ An error occurred while processing your request. Please try again.',
      flags: 64 // EPHEMERAL flag
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: errorMessage.content });
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Handle slash commands
async function handleSlashCommands(interaction) {
  const { commandName } = interaction;

  switch (commandName) {
    case 'adduser':
      await adminHandler.handleAddUser(interaction);
      break;
    case 'addwhitelist':
      await adminHandler.handleAddWhitelist(interaction);
      break;
    case 'ticket-user-id':
      await adminHandler.handleTicketUserId(interaction);
      break;
    case 'stats':
      await adminHandler.handleStats(interaction);
      break;
    case 'leaderboard':
      await adminHandler.handleLeaderboard(interaction);
      break;
    case 'settings':
      await adminHandler.handleSettings(interaction);
      break;
    case 'backup':
      await adminHandler.handleBackup(interaction);
      break;
    case 'cleanup':
      await adminHandler.handleCleanup(interaction);
      break;
    default:
      await interaction.reply({
        content: '❌ Unknown command.',
        flags: 64
      });
  }
}

// Handle select menus
async function handleSelectMenu(interaction) {
  const { customId } = interaction;

  if (customId === 'ticket_type') {
    await ticketHandler.handleTicketTypeSelect(interaction);
  } else if (customId === 'game_select') {
    await gameHandler.handleGameSelect(interaction);
  } else if (customId === 'settings_select') {
    await handleSettingsSelect(interaction);
  } else {
    await interactionHandler.handleSelectMenu(interaction);
  }
}

// Handle buttons
async function handleButton(interaction) {
  const { customId } = interaction;

  // Game buttons
  if (customId.startsWith('game_') || customId.startsWith('ttt_') || customId.startsWith('rps_') ||
      customId.startsWith('trivia_') || customId.startsWith('hangman_') || customId.startsWith('play_again_') ||
      customId === 'change_game') {
    await gameHandler.handleGameButton(interaction);
  }
  // Ticket buttons
  else if (customId === 'claim_ticket' || customId === 'close_ticket') {
    if (customId === 'claim_ticket') {
      await ticketHandler.handleClaimTicket(interaction);
    } else if (customId === 'close_ticket') {
      await ticketHandler.handleCloseTicket(interaction);
    }
  }
  // Lock/unlock buttons
  else if (customId === 'lock_ticket' || customId === 'unlock_ticket') {
    if (customId === 'lock_ticket') {
      await ticketHandler.handleLockTicket(interaction);
    } else {
      await ticketHandler.handleUnlockTicket(interaction);
    }
  }
  // Rating buttons
  else if (customId.startsWith('rate_')) {
    await ticketHandler.handleRating(interaction);
  }
  // Admin buttons
  else if (customId.startsWith('admin_')) {
    await adminHandler.handleAdminButton(interaction);
  }
  // Other buttons
  else {
    await interactionHandler.handleButton(interaction);
  }
}

// Handle modal submits
async function handleModalSubmit(interaction) {
  const { customId } = interaction;

  // Ticket modals
  if (['buy_tool_modal', 'idea_modal', 'support_modal', 'partnership_modal', 'partisanship_modal'].includes(customId)) {
    await ticketHandler.handleTicketModal(interaction);
  }
  // Close reason modal
  else if (customId === 'close_reason_modal') {
    await ticketHandler.handleCloseReasonModal(interaction);
  }
  // Game modals
  else if (customId === 'math_difficulty') {
    await gameHandler.handleMathDifficultyModal(interaction);
  } else if (customId === 'trivia_answer_modal') {
    await gameHandler.handleTriviaAnswerModal(interaction);
  }
  // Settings modals
  else if (customId.startsWith('ticket_') || customId.startsWith('game_') ||
           customId.startsWith('logging_') || customId.startsWith('whitelist_') ||
           customId.startsWith('custom_') || customId.startsWith('backup_')) {
    await adminHandler.handleSettingsModal(interaction);
  }
  // Other modals
  else {
    await interactionHandler.handleModalSubmit(interaction);
  }
}

// Handle autocomplete
async function handleAutocomplete(interaction) {
  const { commandName, options } = interaction;

  switch (commandName) {
    case 'stats':
      await adminHandler.handleStatsAutocomplete(interaction);
      break;
    case 'leaderboard':
      await adminHandler.handleLeaderboardAutocomplete(interaction);
      break;
  }
}

// Handle settings select menu
async function handleSettingsSelect(interaction) {
  const settingType = interaction.values[0];

  const modals = {
    ticket_settings: createTicketSettingsModal,
    game_settings: createGameSettingsModal,
    logging_settings: createLoggingSettingsModal,
    whitelist: createWhitelistModal,
    custom_fields: createCustomFieldsModal,
    backup_settings: createBackupSettingsModal
  };

  if (modals[settingType]) {
    const modal = modals[settingType]();
    await interaction.showModal(modal);
  }
}

// Create settings modals
function createTicketSettingsModal() {
  const modal = new ModalBuilder()
    .setCustomId('ticket_settings_modal')
    .setTitle('Ticket Settings');

  const closeDelay = new TextInputBuilder()
    .setCustomId('close_delay')
    .setLabel('Ticket close delay (seconds)')
    .setPlaceholder('300')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const gameOfferDelay = new TextInputBuilder()
    .setCustomId('game_offer_delay')
    .setLabel('Game offer delay (seconds)')
    .setPlaceholder('3000')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const transcriptEnabled = new TextInputBuilder()
    .setCustomId('transcript_enabled')
    .setLabel('Enable transcripts (yes/no)')
    .setPlaceholder('yes')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(closeDelay),
    new ActionRowBuilder().addComponents(gameOfferDelay),
    new ActionRowBuilder().addComponents(transcriptEnabled)
  );

  return modal;
}

function createGameSettingsModal() {
  const modal = new ModalBuilder()
    .setCustomId('game_settings_modal')
    .setTitle('Game Settings');

  const tttDifficulty = new TextInputBuilder()
    .setCustomId('ttt_difficulty')
    .setLabel('Tic Tac Toe AI difficulty (easy/normal/hard)')
    .setPlaceholder('normal')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const mathRange = new TextInputBuilder()
    .setCustomId('math_range')
    .setLabel('Math game max range')
    .setPlaceholder('100')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const guessMax = new TextInputBuilder()
    .setCustomId('guess_max')
    .setLabel('Number guessing max attempts')
    .setPlaceholder('7')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(tttDifficulty),
    new ActionRowBuilder().addComponents(mathRange),
    new ActionRowBuilder().addComponents(guessMax)
  );

  return modal;
}

function createLoggingSettingsModal() {
  const modal = new ModalBuilder()
    .setCustomId('logging_settings_modal')
    .setTitle('Logging Settings');

  const logLevel = new TextInputBuilder()
    .setCustomId('log_level')
    .setLabel('Log level (error/warn/info/debug)')
    .setPlaceholder('info')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const maxSize = new TextInputBuilder()
    .setCustomId('max_size')
    .setLabel('Max log file size (e.g., 10m, 1g)')
    .setPlaceholder('10m')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const maxFiles = new TextInputBuilder()
    .setCustomId('max_files')
    .setLabel('Max log files to keep')
    .setPlaceholder('5')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(logLevel),
    new ActionRowBuilder().addComponents(maxSize),
    new ActionRowBuilder().addComponents(maxFiles)
  );

  return modal;
}

function createWhitelistModal() {
  const modal = new ModalBuilder()
    .setCustomId('whitelist_modal')
    .setTitle('Whitelist Management');

  const action = new TextInputBuilder()
    .setCustomId('whitelist_action')
    .setLabel('Action (add/remove)')
    .setPlaceholder('add')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const userId = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('User ID')
    .setPlaceholder('123456789012345678')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(action),
    new ActionRowBuilder().addComponents(userId)
  );

  return modal;
}

function createCustomFieldsModal() {
  const modal = new ModalBuilder()
    .setCustomId('custom_fields_modal')
    .setTitle('Custom Fields');

  const ticketType = new TextInputBuilder()
    .setCustomId('ticket_type')
    .setLabel('Ticket type')
    .setPlaceholder('support')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const fieldName = new TextInputBuilder()
    .setCustomId('field_name')
    .setLabel('Field name')
    .setPlaceholder('priority')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const fieldType = new TextInputBuilder()
    .setCustomId('field_type')
    .setLabel('Field type (text/select/number)')
    .setPlaceholder('select')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const required = new TextInputBuilder()
    .setCustomId('required')
    .setLabel('Required (yes/no)')
    .setPlaceholder('no')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const options = new TextInputBuilder()
    .setCustomId('options')
    .setLabel('Options (comma-separated for select)')
    .setPlaceholder('low,medium,high')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ticketType),
    new ActionRowBuilder().addComponents(fieldName),
    new ActionRowBuilder().addComponents(fieldType),
    new ActionRowBuilder().addComponents(required),
    new ActionRowBuilder().addComponents(options)
  );

  return modal;
}

function createBackupSettingsModal() {
  const modal = new ModalBuilder()
    .setCustomId('backup_settings_modal')
    .setTitle('Backup Settings');

  const interval = new TextInputBuilder()
    .setCustomId('backup_interval')
    .setLabel('Backup interval (hours)')
    .setPlaceholder('24')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const retention = new TextInputBuilder()
    .setCustomId('retention_days')
    .setLabel('Backup retention (days)')
    .setPlaceholder('30')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(interval),
    new ActionRowBuilder().addComponents(retention)
  );

  return modal;
}

// Register slash commands
async function registerSlashCommands() {
  const commands = [
    {
      name: 'adduser',
      description: 'Add a user to the current ticket',
      options: [
        {
          name: 'user',
          type: 6,
          description: 'The user to add to the ticket',
          required: true
        }
      ]
    },
    {
      name: 'addwhitelist',
      description: 'Add user to whitelist (Admin only)'
    },
    {
      name: 'ticket-user-id',
      description: 'Get the user ID of the ticket owner (Staff only)'
    },
    {
      name: 'stats',
      description: 'View bot statistics',
      options: [
        {
          name: 'type',
          type: 3,
          description: 'Type of statistics to view',
          required: false,
          autocomplete: true
        },
        {
          name: 'days',
          type: 4,
          description: 'Number of days to look back (default: 30)',
          required: false
        }
      ]
    },
    {
      name: 'leaderboard',
      description: 'View leaderboards',
      options: [
        {
          name: 'type',
          type: 3,
          description: 'Type of leaderboard',
          required: true,
          autocomplete: true
        }
      ]
    },
    {
      name: 'settings',
      description: 'Bot settings management (Admin only)'
    },
    {
      name: 'backup',
      description: 'Create database backup (Admin only)'
    },
    {
      name: 'cleanup',
      description: 'Clean up old data (Admin only)'
    }
  ];

  try {
    console.log('Started refreshing application (/) commands.');

    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (guild) {
      await guild.commands.set(commands);
      console.log('Successfully reloaded application (/) commands for guild.');
    }
  } catch (error) {
    logger.logError(error, { context: 'Command registration' });
  }
}

// Send ticket panel
async function sendTicketPanel() {
  const guild = client.guilds.cache.get(config.GUILD_ID);
  const channel = guild.channels.cache.get(config.TICKET_CHANNEL_ID);

  if (channel) {
    const embed = utils.createEmbed({
      title: '<:MSKXticket:1420044135238209699> 𝗧𝗶𝗰𝗸𝗲𝘁 𝗦𝘂𝗽𝗽𝗼𝗿𝘁 𝗦𝘆𝘀𝘁𝗲𝗺 <:MSKXticket:1420044135238209699>',
      description: `Hey everyone, our ticket support system is now live!
You can use it to:

<a:pin:1420040020659798088> Report errors or problems with bots
<a:msk:1420028321298776124> Buy private bots directly from support
<:16218suport:1420028949517303990> Ask questions about our services
<:400377tools:1420028961588641892> Report bugs in our website or other services
<a:light_bulb:1420097046802858117> Suggest new idea

<:warn:1420044230247583834> Important Rules:
• Do not open tickets for trolling or wasting time
• Only open a ticket if you have a real reason

<:950972embaixador:1420029332734349343> Support Hours:
Our team is available 12 hours a day, every day. We aim to reply to all tickets as fast as possible.

<a:by_noobot:1420043741669883974> Thank you to everyone who uses our support system. Your ideas and feedback help us grow stronger every day!

<a:thunder:1420036448694042706> While you wait for support, you can play mini-games!`,
      color: config.EMBED_COLOR,
      footer: {
        text: 'Select an option below to create a ticket',
        iconURL: 'https://cdn.discordapp.com/attachments/1419845832311832666/1420093867012657263/MSKXticket.png?ex=68d424f9&is=68d2d379&hm=fe5e8b8194067e0491fc1a33d7ca7c99ae707ab8f8be3847d3f26691377b9b98'
      }
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_type')
      .setPlaceholder('Choose your ticket type...')
      .addOptions([
        {
          label: 'Buy Private Bot',
          description: 'Purchase private bots from our collection',
          value: 'buy_private_bot',
          emoji: '<:MSKXticket:1420044135238209699>'
        },
        {
          label: 'Idea',
          description: 'Suggest new tools or improvements',
          value: 'idea',
          emoji: '<a:light_bulb:1420097046802858117>'
        },
        {
          label: 'Support & Asking',
          description: 'Get help with problems or ask questions',
          value: 'support',
          emoji: '<:381258twotonedstaffids:1420097546365309029>'
        },
        {
          label: 'Partnership',
          description: 'Business partnership opportunities',
          value: 'partnership',
          emoji: '<a:by_noobot:1420097825131335842>'
        }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await channel.send({
      embeds: [embed],
      components: [row]
    });
  }
}

// Schedule cleanup tasks
function scheduleCleanupTasks() {
  // Clean up old analytics data daily
  cron.schedule('0 2 * * *', async () => {
    try {
      await Analytics.cleanup(90); // Keep 90 days of analytics
      logger.info('Scheduled analytics cleanup completed');
    } catch (error) {
      logger.logError(error, { context: 'Scheduled analytics cleanup' });
    }
  });

  // Clean up old backups weekly
  cron.schedule('0 3 * * 0', async () => {
    try {
      await adminHandler.cleanupOldBackups();
      logger.info('Scheduled backup cleanup completed');
    } catch (error) {
      logger.logError(error, { context: 'Scheduled backup cleanup' });
    }
  });

  // Clean up rate limits every hour
  setInterval(() => {
    gameHandler.cleanupRateLimits();
  }, 60 * 60 * 1000); // 1 hour
}

// Handle message events for games
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Handle game responses
  if (gameHandler) {
    await gameHandler.handleMessage(message);
  }
});

// Handle PayPal order checks (if implemented)
// setInterval(async () => {
//   if (paypalHandler) {
//     await paypalHandler.checkPendingPayPalOrders();
//   }
// }, 5 * 60 * 1000); // Check every 5 minutes

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');

  try {
    // Close database connections
    await Database.close();

    // Clear any active timeouts/intervals
    if (gameHandler) {
      gameHandler.cleanup();
    }

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.logError(error, { context: 'Graceful shutdown' });
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Error handling
process.on('unhandledRejection', (error) => {
  logger.logError(error, { context: 'Unhandled promise rejection' });
});

process.on('uncaughtException', (error) => {
  logger.logError(error, { context: 'Uncaught exception' });
  process.exit(1);
});

// Login (skip when DRY_RUN is enabled)
if (config.DRY_RUN) {
  console.log('DRY_RUN is enabled — skipping client.login');
} else {
  client.login(config.TOKEN);
}
