// Admin handler for administrative commands and functionality

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../config');
const utils = require('../utils');
const Ticket = require('../models/ticket');
const User = require('../models/user');
const Analytics = require('../models/analytics');
const Database = require('../models/database');
const { logger } = require('../logger');
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');

class AdminHandler {
  constructor(client) {
    this.client = client;
    this.settings = new Map(); // In-memory settings cache
    this.loadSettings();
  }

  /**
   * Load settings from database
   */
  async loadSettings() {
    try {
      const rows = await Database.all('SELECT key, value FROM settings');
      rows.forEach(row => {
        this.settings.set(row.key, JSON.parse(row.value || '{}'));
      });
      logger.info('Settings loaded from database', { count: rows.length });
    } catch (error) {
      logger.logError(error, { context: 'Loading settings' });
    }
  }

  /**
   * Save settings to database
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  async saveSetting(key, value) {
    try {
      await Database.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, JSON.stringify(value)]
      );
      this.settings.set(key, value);
      logger.audit(`Setting updated: ${key}`, { value });
    } catch (error) {
      logger.logError(error, { context: 'Saving setting', key });
      throw error;
    }
  }

  /**
   * Handle add user command
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleAddUser(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
    }

    const user = interaction.options.getUser('user');
    const channel = interaction.channel;

    // Check if this is a ticket channel
    const ticket = await Ticket.findByChannelId(channel.id);
    if (!ticket) {
      return await interaction.reply({
        content: '❌ This command can only be used in ticket channels.',
        flags: 64
      });
    }

    try {
      await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      const embed = utils.createEmbed({
        title: '👥 User Added to Ticket',
        description: `${user} has been added to the ticket.`,
        color: config.SUCCESS_COLOR
      });

      await interaction.reply({ embeds: [embed] });

      logger.ticket('User added to ticket', {
        ticketId: ticket.ticketId,
        addedUserId: user.id,
        addedBy: interaction.user.id
      });

    } catch (error) {
      logger.logError(error, { context: 'Adding user to ticket' });
      await interaction.reply({
        content: '❌ Failed to add user to ticket.',
        flags: 64
      });
    }
  }

  /**
   * Handle add whitelist command
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleAddWhitelist(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
    }

    const whitelist = this.settings.get('whitelist') || [];
    const userId = interaction.user.id;

    if (!whitelist.includes(userId)) {
      whitelist.push(userId);
      await this.saveSetting('whitelist', whitelist);

      await interaction.reply({
        content: '✅ You have been added to the whitelist.',
        flags: 64
      });

      logger.audit('User added to whitelist', { userId });
    } else {
      await interaction.reply({
        content: 'ℹ️ You are already in the whitelist.',
        flags: 64
      });
    }
  }

  /**
   * Handle ticket user ID command
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleTicketUserId(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
    }

    const channel = interaction.channel;
    const ticket = await Ticket.findByChannelId(channel.id);

    if (!ticket) {
      return await interaction.reply({
        content: '❌ This is not a ticket channel.',
        flags: 64
      });
    }

    await interaction.reply({
      content: `**Ticket Owner:** ${ticket.username} (${ticket.userId})`,
      flags: 64
    });
  }

  /**
   * Handle stats command
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleStats(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const type = interaction.options.getString('type') || 'overview';
      const days = interaction.options.getInteger('days') || 30;

      let embed;

      switch (type) {
        case 'overview':
          embed = await this.createOverviewStatsEmbed(days);
          break;
        case 'tickets':
          embed = await this.createTicketStatsEmbed(days);
          break;
        case 'games':
          embed = await this.createGameStatsEmbed(days);
          break;
        case 'users':
          embed = await this.createUserStatsEmbed(days);
          break;
        case 'staff':
          embed = await this.createStaffStatsEmbed(days);
          break;
        default:
          embed = utils.createEmbed({
            title: '📊 Bot Statistics',
            description: 'Invalid stats type.',
            color: config.ERROR_COLOR
          });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.logError(error, { context: 'Generating stats' });
      await interaction.editReply({
        content: '❌ Failed to generate statistics.',
        flags: 64
      });
    }
  }

  /**
   * Create overview statistics embed
   * @param {number} days - Number of days
   * @returns {EmbedBuilder} Statistics embed
   */
  async createOverviewStatsEmbed(days) {
    const summary = await Analytics.getSummary(days);
    const dbStats = await Database.getStats();

    const embed = utils.createEmbed({
      title: '📊 Bot Overview Statistics',
      color: config.EMBED_COLOR,
      fields: [
        { name: '📈 Period', value: summary.period, inline: true },
        { name: '👥 Total Users', value: summary.users.total.toString(), inline: true },
        { name: '🎟️ Total Tickets', value: summary.tickets.total.toString(), inline: true },
        { name: '🎮 Total Games', value: summary.games.total.toString(), inline: true },
        { name: '⭐ Total Ratings', value: summary.ratings.total.toString(), inline: true },
        { name: '📊 Active Tickets', value: summary.tickets.active.toString(), inline: true },
        { name: '⭐ Average Rating', value: summary.ratings.average.toFixed(1), inline: true },
        { name: '💾 Database Size', value: utils.formatFileSize(dbStats.fileSize), inline: true },
        { name: '🎯 Active Games', value: this.client.gameHandler?.getActiveGamesCount()?.toString() || '0', inline: true }
      ],
      footer: { text: `Generated on ${utils.formatTimestamp(Date.now())}` }
    });

    return embed;
  }

  /**
   * Create ticket statistics embed
   * @param {number} days - Number of days
   * @returns {EmbedBuilder} Statistics embed
   */
  async createTicketStatsEmbed(days) {
    const ticketStats = await Ticket.getStats({ dateFrom: this.getDateFromDays(days) });
    const ticketTypes = await Analytics.getTicketTypeDistribution(days);

    const embed = utils.createEmbed({
      title: '🎟️ Ticket Statistics',
      color: config.EMBED_COLOR,
      fields: [
        { name: '📊 Total Tickets', value: ticketStats.total.toString(), inline: true },
        { name: '🔓 Open/Claimed', value: (ticketStats.byStatus.open || 0 + ticketStats.byStatus.claimed || 0).toString(), inline: true },
        { name: '✅ Closed', value: (ticketStats.byStatus.closed || 0).toString(), inline: true },
        { name: '⏱️ Avg Response Time', value: `${Math.round(ticketStats.averageResponseTime / 60)}m`, inline: true },
        { name: '⏱️ Avg Resolution Time', value: `${Math.round(ticketStats.averageResolutionTime / 60)}m`, inline: true },
        ...ticketTypes.slice(0, 3).map(type => ({
          name: `📂 ${type.type}`,
          value: type.count.toString(),
          inline: true
        }))
      ]
    });

    return embed;
  }

  /**
   * Create game statistics embed
   * @param {number} days - Number of days
   * @returns {EmbedBuilder} Statistics embed
   */
  async createGameStatsEmbed(days) {
    const gameStats = await Analytics.getGameStats(days);

    const embed = utils.createEmbed({
      title: '🎮 Game Statistics',
      color: config.EMBED_COLOR,
      fields: [
        { name: '🎯 Total Games', value: gameStats.overview.totalGames.toString(), inline: true },
        { name: '👥 Unique Players', value: gameStats.overview.uniquePlayers.toString(), inline: true },
        { name: '🏆 Total Wins', value: gameStats.overview.totalWins.toString(), inline: true },
        { name: '😢 Total Losses', value: gameStats.overview.totalLosses.toString(), inline: true },
        { name: '🤝 Total Ties', value: gameStats.overview.totalTies.toString(), inline: true },
        ...gameStats.byType.slice(0, 3).map(game => ({
          name: `🎲 ${game.type}`,
          value: `${game.count} games (${Math.round(game.avgDuration / 1000)}s avg)`,
          inline: true
        }))
      ]
    });

    return embed;
  }

  /**
   * Create user statistics embed
   * @param {number} days - Number of days
   * @returns {EmbedBuilder} Statistics embed
   */
  async createUserStatsEmbed(days) {
    const topUsers = await User.getTopUsers('tickets_created', 5);
    const topRated = await User.getTopUsers('rating_average', 5);

    const embed = utils.createEmbed({
      title: '👥 User Statistics',
      color: config.EMBED_COLOR,
      fields: [
        { name: '🏆 Top Ticket Creators', value: topUsers.map((user, i) => `${i + 1}. ${user.username} (${user.value})`).join('\n'), inline: false },
        { name: '⭐ Top Rated Users', value: topRated.map((user, i) => `${i + 1}. ${user.username} (${user.value.toFixed(1)}⭐)`).join('\n'), inline: false }
      ]
    });

    return embed;
  }

  /**
   * Create staff statistics embed
   * @param {number} days - Number of days
   * @returns {EmbedBuilder} Statistics embed
   */
  async createStaffStatsEmbed(days) {
    const staffPerformance = await Analytics.getStaffPerformance(days);

    const embed = utils.createEmbed({
      title: '👨‍💼 Staff Performance',
      color: config.EMBED_COLOR,
      fields: [
        { name: '📊 Staff Members Analyzed', value: staffPerformance.length.toString(), inline: true },
        ...staffPerformance.slice(0, 5).map((staff, i) => ({
          name: `🏅 #${i + 1} Staff Member`,
          value: `Tickets: ${staff.ticketsClaimed}\nAvg Resolution: ${Math.round(staff.avgResolutionTime)}m`,
          inline: true
        }))
      ]
    });

    return embed;
  }

  /**
   * Handle leaderboard command
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleLeaderboard(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const type = interaction.options.getString('type');

      let embed;

      switch (type) {
        case 'tickets':
          embed = await this.createTicketsLeaderboardEmbed();
          break;
        case 'ratings':
          embed = await this.createRatingsLeaderboardEmbed();
          break;
        case 'games':
          embed = await this.createGamesLeaderboardEmbed();
          break;
        default:
          embed = utils.createEmbed({
            title: '🏆 Leaderboards',
            description: 'Invalid leaderboard type.',
            color: config.ERROR_COLOR
          });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.logError(error, { context: 'Generating leaderboard' });
      await interaction.editReply({
        content: '❌ Failed to generate leaderboard.',
        flags: 64
      });
    }
  }

  /**
   * Create tickets leaderboard embed
   * @returns {EmbedBuilder} Leaderboard embed
   */
  async createTicketsLeaderboardEmbed() {
    const leaderboard = await User.getLeaderboard('tickets', 10);

    const embed = utils.createEmbed({
      title: '🎟️ Tickets Created Leaderboard',
      color: config.EMBED_COLOR,
      description: leaderboard.map(user => `**${user.rank}.** ${user.username} - ${user.score} tickets`).join('\n') || 'No data available.',
      footer: { text: 'Top ticket creators' }
    });

    return embed;
  }

  /**
   * Create ratings leaderboard embed
   * @returns {EmbedBuilder} Leaderboard embed
   */
  async createRatingsLeaderboardEmbed() {
    const leaderboard = await User.getLeaderboard('ratings', 10);

    const embed = utils.createEmbed({
      title: '⭐ Ratings Leaderboard',
      color: config.EMBED_COLOR,
      description: leaderboard.map(user => `**${user.rank}.** ${user.username} - ${user.score}⭐`).join('\n') || 'No data available.',
      footer: { text: 'Highest rated users (min 5 ratings)' }
    });

    return embed;
  }

  /**
   * Create games leaderboard embed
   * @returns {EmbedBuilder} Leaderboard embed
   */
  async createGamesLeaderboardEmbed() {
    const leaderboard = await User.getLeaderboard('games', 10);

    const embed = utils.createEmbed({
      title: '🎮 Games Played Leaderboard',
      color: config.EMBED_COLOR,
      description: leaderboard.map(user => `**${user.rank}.** ${user.username} - ${user.score} games`).join('\n') || 'No data available.',
      footer: { text: 'Most active gamers' }
    });

    return embed;
  }

  /**
   * Handle settings command
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleSettings(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
    }

    const embed = utils.createEmbed({
      title: '⚙️ Bot Settings',
      description: 'Choose a setting to modify:',
      color: config.EMBED_COLOR
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('settings_select')
      .setPlaceholder('Select a setting...')
      .addOptions([
        { label: 'Ticket Settings', value: 'ticket_settings', description: 'Manage ticket configuration' },
        { label: 'Game Settings', value: 'game_settings', description: 'Manage game configuration' },
        { label: 'Logging Settings', value: 'logging_settings', description: 'Manage logging configuration' },
        { label: 'Whitelist Management', value: 'whitelist', description: 'Manage whitelisted users' },
        { label: 'Custom Fields', value: 'custom_fields', description: 'Manage custom ticket fields' },
        { label: 'Backup Settings', value: 'backup_settings', description: 'Manage backup configuration' }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: 64
    });
  }

  /**
   * Handle settings modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleSettingsModal(interaction) {
    const { customId } = interaction;
    const settingType = customId.split('_')[0]; // e.g., 'ticket', 'game', etc.

    try {
      switch (settingType) {
        case 'ticket':
          await this.handleTicketSettingsModal(interaction);
          break;
        case 'game':
          await this.handleGameSettingsModal(interaction);
          break;
        case 'logging':
          await this.handleLoggingSettingsModal(interaction);
          break;
        case 'whitelist':
          await this.handleWhitelistModal(interaction);
          break;
        case 'custom':
          await this.handleCustomFieldsModal(interaction);
          break;
        case 'backup':
          await this.handleBackupSettingsModal(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown setting type.',
            flags: 64
          });
      }
    } catch (error) {
      logger.logError(error, { context: 'Handling settings modal', customId });
      await interaction.reply({
        content: '❌ Failed to update setting.',
        flags: 64
      });
    }
  }

  /**
   * Handle ticket settings modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleTicketSettingsModal(interaction) {
    const closeDelay = parseInt(interaction.fields.getTextInputValue('close_delay')) * 1000;
    const gameOfferDelay = parseInt(interaction.fields.getTextInputValue('game_offer_delay')) * 1000;
    const transcriptEnabled = interaction.fields.getTextInputValue('transcript_enabled') === 'yes';

    const ticketSettings = this.settings.get('ticket') || {};
    ticketSettings.closeDelay = closeDelay;
    ticketSettings.gameOfferDelay = gameOfferDelay;
    ticketSettings.transcriptEnabled = transcriptEnabled;

    await this.saveSetting('ticket', ticketSettings);

    // Update config if needed (for runtime changes)
    config.TICKET_CLOSE_DELAY = closeDelay;
    config.GAME_OFFER_DELAY = gameOfferDelay;
    config.TICKET_TRANSCRIPT_ENABLED = transcriptEnabled;

    await interaction.reply({
      content: '✅ Ticket settings updated successfully!',
      flags: 64
    });

    logger.audit('Ticket settings updated', {
      closeDelay,
      gameOfferDelay,
      transcriptEnabled,
      updatedBy: interaction.user.id
    });
  }

  /**
   * Handle game settings modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleGameSettingsModal(interaction) {
    const tttDifficulty = interaction.fields.getTextInputValue('ttt_difficulty');
    const mathRange = parseInt(interaction.fields.getTextInputValue('math_range'));
    const guessMax = parseInt(interaction.fields.getTextInputValue('guess_max'));

    const gameSettings = this.settings.get('games') || {};
    gameSettings.tictactoe = { ...gameSettings.tictactoe, aiDifficulty: tttDifficulty };
    gameSettings.math = { ...gameSettings.math, range: mathRange };
    gameSettings.guessing = { ...gameSettings.guessing, maxAttempts: guessMax };

    await this.saveSetting('games', gameSettings);

    await interaction.reply({
      content: '✅ Game settings updated successfully!',
      flags: 64
    });

    logger.audit('Game settings updated', {
      tttDifficulty,
      mathRange,
      guessMax,
      updatedBy: interaction.user.id
    });
  }

  /**
   * Handle logging settings modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleLoggingSettingsModal(interaction) {
    const logLevel = interaction.fields.getTextInputValue('log_level');
    const maxSize = interaction.fields.getTextInputValue('max_size');
    const maxFiles = parseInt(interaction.fields.getTextInputValue('max_files'));

    const loggingSettings = this.settings.get('logging') || {};
    loggingSettings.level = logLevel;
    loggingSettings.maxSize = maxSize;
    loggingSettings.maxFiles = maxFiles;

    await this.saveSetting('logging', loggingSettings);

    // Update logger level if possible
    if (logger.transports) {
      logger.transports.forEach(transport => {
        transport.level = logLevel;
      });
    }

    await interaction.reply({
      content: '✅ Logging settings updated successfully!',
      flags: 64
    });

    logger.audit('Logging settings updated', {
      logLevel,
      maxSize,
      maxFiles,
      updatedBy: interaction.user.id
    });
  }

  /**
   * Handle whitelist modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleWhitelistModal(interaction) {
    const action = interaction.fields.getTextInputValue('whitelist_action');
    const userId = interaction.fields.getTextInputValue('user_id');

    const whitelist = this.settings.get('whitelist') || [];

    if (action === 'add' && !whitelist.includes(userId)) {
      whitelist.push(userId);
      await this.saveSetting('whitelist', whitelist);
      await interaction.reply({
        content: `✅ User ${userId} added to whitelist.`,
        flags: 64
      });
    } else if (action === 'remove' && whitelist.includes(userId)) {
      const newWhitelist = whitelist.filter(id => id !== userId);
      await this.saveSetting('whitelist', newWhitelist);
      await interaction.reply({
        content: `✅ User ${userId} removed from whitelist.`,
        flags: 64
      });
    } else {
      await interaction.reply({
        content: 'ℹ️ No changes needed.',
        flags: 64
      });
    }

    logger.audit(`Whitelist ${action}d`, { userId, updatedBy: interaction.user.id });
  }

  /**
   * Handle custom fields modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleCustomFieldsModal(interaction) {
    const ticketType = interaction.fields.getTextInputValue('ticket_type');
    const fieldName = interaction.fields.getTextInputValue('field_name');
    const fieldType = interaction.fields.getTextInputValue('field_type');
    const required = interaction.fields.getTextInputValue('required') === 'yes';
    const options = interaction.fields.getTextInputValue('options') || null;

    await Database.run(
      `INSERT OR REPLACE INTO custom_fields (ticket_type, field_name, field_type, required, options)
       VALUES (?, ?, ?, ?, ?)`,
      [ticketType, fieldName, fieldType, required, options]
    );

    await interaction.reply({
      content: `✅ Custom field "${fieldName}" added for ${ticketType} tickets.`,
      flags: 64
    });

    logger.audit('Custom field added', {
      ticketType,
      fieldName,
      fieldType,
      required,
      options,
      updatedBy: interaction.user.id
    });
  }

  /**
   * Handle backup settings modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleBackupSettingsModal(interaction) {
    const interval = parseInt(interaction.fields.getTextInputValue('backup_interval'));
    const retention = parseInt(interaction.fields.getTextInputValue('retention_days'));

    const backupSettings = this.settings.get('backup') || {};
    backupSettings.interval = interval * 60 * 60 * 1000; // Convert to ms
    backupSettings.retention = retention;

    await this.saveSetting('backup', backupSettings);

    // Schedule backup job if not already scheduled
    this.scheduleBackupJob();

    await interaction.reply({
      content: '✅ Backup settings updated successfully!',
      flags: 64
    });

    logger.audit('Backup settings updated', {
      interval,
      retention,
      updatedBy: interaction.user.id
    });
  }

  /**
   * Handle backup command
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleBackup(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const backupDir = path.join('./data/backups');
      await utils.ensureDirectoryExists(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

      await Database.backup(backupPath);

      const embed = utils.createEmbed({
        title: '💾 Database Backup Created',
        description: `**Backup File:** ${path.basename(backupPath)}\n**Size:** ${utils.formatFileSize(await fs.stat(backupPath).size)}\n**Created:** ${utils.formatTimestamp(Date.now())}`,
        color: config.SUCCESS_COLOR,
        fields: [
          { name: '📁 Location', value: backupPath, inline: false }
        ]
      });

      await interaction.editReply({ embeds: [embed] });

      logger.audit('Manual backup created', {
        backupPath,
        size: await fs.stat(backupPath).size,
        createdBy: interaction.user.id
      });

      await Analytics.logEvent('backup_created', 1);

    } catch (error) {
      logger.logError(error, { context: 'Creating backup' });
      await interaction.editReply({
        content: '❌ Failed to create backup.',
        flags: 64
      });
    }
  }

  /**
   * Handle cleanup command
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleCleanup(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const cleanedAnalytics = await Analytics.cleanup(90);
      await Database.cleanup();
      const oldBackups = await this.cleanupOldBackups();

      const embed = utils.createEmbed({
        title: '🧹 Cleanup Completed',
        description: 'Database and files have been cleaned up.',
        color: config.SUCCESS_COLOR,
        fields: [
          { name: '📊 Old Analytics Deleted', value: cleanedAnalytics.toString(), inline: true },
          { name: '💾 Old Backups Deleted', value: oldBackups.toString(), inline: true },
          { name: '🔄 Database Vacuumed', value: '✅ Completed', inline: true }
        ]
      });

      await interaction.editReply({ embeds: [embed] });

      logger.audit('Cleanup performed', {
        analyticsDeleted: cleanedAnalytics,
        backupsDeleted: oldBackups,
        performedBy: interaction.user.id
      });

    } catch (error) {
      logger.logError(error, { context: 'Performing cleanup' });
      await interaction.editReply({
        content: '❌ Failed to perform cleanup.',
        flags: 64
      });
    }
  }

  /**
   * Cleanup old backups
   * @returns {Promise<number>} Number of backups deleted
   */
  async cleanupOldBackups() {
    const backupDir = path.join('./data/backups');
    if (!await fs.pathExists(backupDir)) return 0;

    const files = await fs.readdir(backupDir);
    const backupFiles = files.filter(file => file.endsWith('.db') && file.startsWith('backup-'));
    const retentionDays = this.settings.get('backup')?.retention || config.BACKUP_RETENTION;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;
    for (const file of backupFiles) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      if (stats.mtime < cutoffDate) {
        await fs.remove(filePath);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Schedule automatic backup job
   */
  scheduleBackupJob() {
    const backupSettings = this.settings.get('backup') || {};
    const interval = backupSettings.interval || config.BACKUP_INTERVAL;

    // Stop existing job if any
    if (this.backupJob) {
      this.backupJob.stop();
    }

    // Schedule new job
    this.backupJob = cron.schedule(`0 0 */${Math.round(interval / (24 * 60 * 60 * 1000))} * *`, async () => {
      try {
        const backupDir = path.join('./data/backups');
        await utils.ensureDirectoryExists(backupDir);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `backup-${timestamp}.db`);

        await Database.backup(backupPath);

        logger.audit('Automatic backup created', { backupPath });

        await Analytics.logEvent('backup_created', 1, { type: 'automatic' });

      } catch (error) {
        logger.logError(error, { context: 'Automatic backup' });
      }
    });

    logger.info('Backup job scheduled', { interval: `${interval / (60 * 60 * 1000)} hours` });
  }

  /**
   * Handle admin button interactions
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleAdminButton(interaction) {
    const { customId } = interaction;

    switch (customId) {
      case 'admin_stats':
        await this.handleStats(interaction);
        break;
      case 'admin_leaderboard':
        await this.handleLeaderboard(interaction);
        break;
      case 'admin_backup':
        await this.handleBackup(interaction);
        break;
      case 'admin_cleanup':
        await this.handleCleanup(interaction);
        break;
      default:
        await interaction.reply({
          content: '❌ Unknown admin button.',
          flags: 64
        });
    }
  }

  /**
   * Handle stats autocomplete
   * @param {AutocompleteInteraction} interaction - Autocomplete interaction
   */
  async handleStatsAutocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const choices = ['overview', 'tickets', 'games', 'users', 'staff'];

    const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
    await interaction.respond(
      filtered.map(choice => ({ name: choice.toUpperCase(), value: choice }))
    );
  }

  /**
   * Handle leaderboard autocomplete
   * @param {AutocompleteInteraction} interaction - Autocomplete interaction
   */
  async handleLeaderboardAutocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const choices = ['tickets', 'ratings', 'games'];

    const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
    await interaction.respond(
      filtered.map(choice => ({ name: choice.toUpperCase(), value: choice }))
    );
  }

  /**
   * Get date from days ago
   * @param {number} days - Number of days
   * @returns {string} Date string
   */
  getDateFromDays(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Get system health metrics
   * @returns {Promise<Object>} Health metrics
   */
  async getSystemHealth() {
    const dbStats = await Database.getStats();
    const activeGames = this.client.gameHandler?.getActiveGamesCount() || 0;
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    return {
      database: {
        size: dbStats.fileSize,
        tables: Object.keys(dbStats).filter(key => key !== 'fileSize').reduce((acc, key) => {
          acc[key] = dbStats[key];
          return acc;
        }, {})
      },
      games: { active: activeGames },
      system: {
        memory: {
          rss: utils.formatFileSize(memoryUsage.rss),
          heapTotal: utils.formatFileSize(memoryUsage.heapTotal),
          heapUsed: utils.formatFileSize(memoryUsage.heapUsed)
        },
        uptime: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
      },
      bot: {
        guilds: this.client.guilds.cache.size,
        users: this.client.users.cache.size,
        channels: this.client.channels.cache.size
      }
    };
  }
}

module.exports = AdminHandler;
