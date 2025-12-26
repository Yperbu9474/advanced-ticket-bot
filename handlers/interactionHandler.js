// Main interaction handler for Discord bot

const { logger } = require('../logger');
const config = require('../config');
const ticketHandler = require('./ticketHandler');
const gameHandler = require('./gameHandler');
const adminHandler = require('./adminHandler');
const utils = require('../utils');

class InteractionHandler {
  constructor(client) {
    this.client = client;
  }

  /**
   * Handle all Discord interactions
   * @param {Interaction} interaction - Discord interaction
   */
  async handle(interaction) {
    const startTime = Date.now();

    try {
      logger.logInteraction(interaction);

      if (interaction.isCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await this.handleSelectMenu(interaction);
      } else if (interaction.isButton()) {
        await this.handleButton(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModalSubmit(interaction);
      } else if (interaction.isAutocomplete()) {
        await this.handleAutocomplete(interaction);
      }

      const duration = Date.now() - startTime;
      logger.performance('Interaction handled', {
        type: interaction.type,
        duration,
        userId: interaction.user.id
      });

    } catch (error) {
      logger.logError(error, {
        interactionType: interaction.type,
        userId: interaction.user.id,
        guildId: interaction.guild?.id
      });

      await this.handleError(interaction, error);
    }
  }

  /**
   * Handle slash commands
   * @param {CommandInteraction} interaction - Slash command interaction
   */
  async handleSlashCommand(interaction) {
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
          content: 'Unknown command.',
          flags: 64
        });
    }
  }

  /**
   * Handle select menu interactions
   * @param {StringSelectMenuInteraction} interaction - Select menu interaction
   */
  async handleSelectMenu(interaction) {
    const { customId } = interaction;

    switch (customId) {
      case 'ticket_type':
        await ticketHandler.handleTicketTypeSelect(interaction);
        break;

      case 'game_select':
        await gameHandler.handleGameSelect(interaction);
        break;

      case 'difficulty_select':
        await gameHandler.handleDifficultySelect(interaction);
        break;

      default:
        await interaction.reply({
          content: 'Unknown selection.',
          flags: 64
        });
    }
  }

  /**
   * Handle button interactions
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleButton(interaction) {
    const { customId } = interaction;

    // Ticket buttons
    if (customId === 'claim_ticket') {
      await ticketHandler.handleClaimTicket(interaction);
    } else if (customId === 'close_ticket') {
      await ticketHandler.handleCloseTicket(interaction);
    } else if (customId.startsWith('rate_')) {
      await ticketHandler.handleRating(interaction);
    }

    // Game buttons
    else if (customId.startsWith('game_')) {
      await gameHandler.handleGameButton(interaction);
    } else if (customId.startsWith('ttt_')) {
      await gameHandler.handleTicTacToeMove(interaction);
    } else if (customId.startsWith('math_')) {
      await gameHandler.handleMathGame(interaction);
    } else if (customId.startsWith('guess_')) {
      await gameHandler.handleNumberGuess(interaction);
    } else if (customId.startsWith('rps_')) {
      await gameHandler.handleRockPaperScissors(interaction);
    } else if (customId.startsWith('trivia_')) {
      await gameHandler.handleTrivia(interaction);
    } else if (customId.startsWith('hangman_')) {
      await gameHandler.handleHangman(interaction);
    }

    // Play again buttons
    else if (customId.startsWith('play_again_')) {
      await gameHandler.handlePlayAgain(interaction);
    }

    // Change game button
    else if (customId === 'change_game') {
      await gameHandler.handleChangeGame(interaction);
    }

    // Admin buttons
    else if (customId.startsWith('admin_')) {
      await adminHandler.handleAdminButton(interaction);
    }

    else {
      await interaction.reply({
        content: 'Unknown button.',
        flags: 64
      });
    }
  }

  /**
   * Handle modal submissions
   * @param {ModalSubmitInteraction} interaction - Modal submit interaction
   */
  async handleModalSubmit(interaction) {
    const { customId } = interaction;

    switch (customId) {
      case 'buy_tool_modal':
      case 'idea_modal':
      case 'support_modal':
      case 'partnership_modal':
      case 'partisanship_modal':
        await ticketHandler.handleTicketModal(interaction);
        break;

      case 'close_reason_modal':
        await ticketHandler.handleCloseReasonModal(interaction);
        break;

      case 'math_difficulty':
        await gameHandler.handleMathDifficultyModal(interaction);
        break;

      case 'trivia_answer':
        await gameHandler.handleTriviaAnswerModal(interaction);
        break;

      case 'settings_modal':
        await adminHandler.handleSettingsModal(interaction);
        break;

      default:
        await interaction.reply({
          content: 'Unknown modal submission.',
          flags: 64
        });
    }
  }

  /**
   * Handle autocomplete interactions
   * @param {AutocompleteInteraction} interaction - Autocomplete interaction
   */
  async handleAutocomplete(interaction) {
    const { commandName, options } = interaction;

    switch (commandName) {
      case 'stats':
        await adminHandler.handleStatsAutocomplete(interaction);
        break;

      case 'leaderboard':
        await adminHandler.handleLeaderboardAutocomplete(interaction);
        break;

      default:
        // No autocomplete for this command
        break;
    }
  }

  /**
   * Handle interaction errors
   * @param {Interaction} interaction - The interaction that caused the error
   * @param {Error} error - The error that occurred
   */
  async handleError(interaction, error) {
    const errorMessage = {
      content: '❌ An error occurred while processing your request. Please try again.',
      flags: 64
    };

    // Check if interaction can still respond
    if (interaction.replied || interaction.deferred) {
      try {
        await interaction.editReply(errorMessage);
      } catch (editError) {
        logger.logError(editError, { context: 'Error editing reply' });
      }
    } else {
      try {
        await interaction.reply(errorMessage);
      } catch (replyError) {
        logger.logError(replyError, { context: 'Error replying to interaction' });
      }
    }

    // Send error notification to staff if it's a critical error
    if (this.isCriticalError(error)) {
      await this.notifyStaffOfError(interaction, error);
    }
  }

  /**
   * Check if an error is critical and needs staff notification
   * @param {Error} error - The error to check
   * @returns {boolean} Whether the error is critical
   */
  isCriticalError(error) {
    const criticalErrors = [
      'DatabaseError',
      'PermissionError',
      'RateLimitError'
    ];

    return criticalErrors.some(criticalType =>
      error.name.includes(criticalType) ||
      error.message.includes(criticalType.toLowerCase())
    );
  }

  /**
   * Notify staff of critical errors
   * @param {Interaction} interaction - The interaction that caused the error
   * @param {Error} error - The error that occurred
   */
  async notifyStaffOfError(interaction, error) {
    try {
      const staffChannel = this.client.channels.cache.get(config.STAR_LOG_CHANNEL_ID);
      if (staffChannel) {
        const errorEmbed = utils.createEmbed({
          title: '🚨 Critical Error Occurred',
          description: `A critical error occurred during interaction handling.`,
          color: config.ERROR_COLOR,
          fields: [
            { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
            { name: 'Channel', value: `${interaction.channel?.name || 'DM'} (${interaction.channel?.id || 'N/A'})`, inline: true },
            { name: 'Command/Action', value: interaction.commandName || interaction.customId || 'Unknown', inline: true },
            { name: 'Error', value: `\`\`\`${error.message}\`\`\``, inline: false },
            { name: 'Stack Trace', value: `\`\`\`${error.stack?.substring(0, 1000)}\`\`\``, inline: false }
          ]
        });

        await staffChannel.send({ embeds: [errorEmbed] });
      }
    } catch (notifyError) {
      logger.logError(notifyError, { context: 'Error notifying staff' });
    }
  }

  /**
   * Register slash commands
   * @param {string} guildId - Guild ID to register commands for
   */
  async registerCommands(guildId) {
    const commands = [
      // Existing commands
      {
        name: 'adduser',
        description: 'Add a user to the current ticket',
        options: [
          {
            name: 'user',
            type: 6, // USER
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

      // New admin commands
      {
        name: 'stats',
        description: 'View bot statistics and analytics',
        options: [
          {
            name: 'type',
            type: 3, // STRING
            description: 'Type of statistics to view',
            required: false,
            choices: [
              { name: 'Overview', value: 'overview' },
              { name: 'Tickets', value: 'tickets' },
              { name: 'Games', value: 'games' },
              { name: 'Users', value: 'users' },
              { name: 'Staff Performance', value: 'staff' }
            ]
          },
          {
            name: 'days',
            type: 4, // INTEGER
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
            type: 3, // STRING
            description: 'Type of leaderboard',
            required: true,
            choices: [
              { name: 'Tickets Created', value: 'tickets' },
              { name: 'Ratings', value: 'ratings' },
              { name: 'Games Played', value: 'games' }
            ]
          }
        ]
      },
      {
        name: 'settings',
        description: 'Manage bot settings (Admin only)'
      },
      {
        name: 'backup',
        description: 'Create a backup of bot data (Admin only)'
      },
      {
        name: 'cleanup',
        description: 'Clean up old data (Admin only)'
      }
    ];

    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (guild) {
        await guild.commands.set(commands);
        logger.info('Successfully registered slash commands', { guildId });
      }
    } catch (error) {
      logger.logError(error, { context: 'Command registration', guildId });
    }
  }
}

module.exports = InteractionHandler;
