// Ticket handling logic

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const utils = require('../utils');
const Ticket = require('../models/ticket');
const User = require('../models/user');
const Analytics = require('../models/analytics');
const { logger } = require('../logger');
const fs = require('fs-extra');
const path = require('path');

class TicketHandler {
  constructor(client) {
    this.client = client;
    this.rateLimits = new Map();
  }

  /**
   * Handle ticket type selection
   * @param {StringSelectMenuInteraction} interaction - Select menu interaction
   */
  async handleTicketTypeSelect(interaction) {
    const ticketType = interaction.values[0];

    // Check rate limit
    if (!utils.checkRateLimit(this.rateLimits, interaction.user.id, config.TICKET_RATE_LIMIT)) {
      return await interaction.reply({
        content: `❌ You're creating tickets too quickly. Please wait ${config.TICKET_RATE_LIMIT.WINDOW_MS / 1000} seconds between ticket creations.`,
        flags: 64
      });
    }

      // Check if user already has an open ticket using user id (more reliable)
      const existingTicket = utils.findExistingTicketByUser(interaction.user.id, interaction.guild.channels.cache, interaction.guild);

      if (existingTicket) {
        return await interaction.reply({
          content: `❌ You already have an open ticket: ${existingTicket}`,
          flags: 64
        });
      }

    // Create appropriate modal based on ticket type
    const modal = this.createTicketModal(ticketType);
    await interaction.showModal(modal);
  }

  /**
   * Create ticket modal based on type
   * @param {string} ticketType - Type of ticket
   * @returns {ModalBuilder} The modal
   */
  createTicketModal(ticketType) {
    let modal;

    switch (ticketType) {
      case 'purchase_help':
        modal = new ModalBuilder()
          .setCustomId('buy_tool_modal')
          .setTitle('🤖 Purchase Help - Ticket Creation');

        const toolInput = new TextInputBuilder()
          .setCustomId('tool_name')
          .setLabel('What do you need help with for purchases?')
          .setPlaceholder('e.g. Bot support issue')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const paymentInput = new TextInputBuilder()
          .setCustomId('payment_method')
          .setLabel('What payment method can you use?')
          .setPlaceholder('e.g. PayPal, Crypto, etc.')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const priorityInput = new TextInputBuilder()
          .setCustomId('priority')
          .setLabel('Priority Level')
          .setPlaceholder('low/normal/high/urgent')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const rulesInput = new TextInputBuilder()
          .setCustomId('rules_accept')
          .setLabel('Have you read and accept terms?')
          .setPlaceholder('Type "Yes" or "No"')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const additionalInput = new TextInputBuilder()
          .setCustomId('additional_info')
          .setLabel('Additional Information (Optional)')
          .setPlaceholder('Any additional details...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(toolInput),
          new ActionRowBuilder().addComponents(paymentInput),
          new ActionRowBuilder().addComponents(priorityInput),
          new ActionRowBuilder().addComponents(rulesInput),
          new ActionRowBuilder().addComponents(additionalInput)
        );
        break;

      case 'idea':
        modal = new ModalBuilder()
          .setCustomId('idea_modal')
          .setTitle('💡 Idea - Ticket Creation');

        const categoryInput = new TextInputBuilder()
          .setCustomId('idea_category')
          .setLabel('Tool category')
          .setPlaceholder('e.g. Discord tool, Create nitro, etc.')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const priorityInputIdea = new TextInputBuilder()
          .setCustomId('priority')
          .setLabel('Priority Level')
          .setPlaceholder('low/normal/high/urgent')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const descriptionInput = new TextInputBuilder()
          .setCustomId('idea_description')
          .setLabel('Describe your idea in detail')
          .setPlaceholder('Explain your tool idea, features, and how it would work...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(categoryInput),
          new ActionRowBuilder().addComponents(priorityInputIdea),
          new ActionRowBuilder().addComponents(descriptionInput)
        );
        break;

      case 'support':
        modal = new ModalBuilder()
          .setCustomId('support_modal')
          .setTitle('🛠️ Support & Asking - Ticket Creation');

        const problemInput = new TextInputBuilder()
          .setCustomId('problem_description')
          .setLabel('What is your problem or question?')
          .setPlaceholder('Describe your issue or question in detail...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const priorityInputSupport = new TextInputBuilder()
          .setCustomId('priority')
          .setLabel('Priority Level')
          .setPlaceholder('low/normal/high/urgent')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const stepsInput = new TextInputBuilder()
          .setCustomId('steps_taken')
          .setLabel('What steps have you already tried? (Optional)')
          .setPlaceholder('List any troubleshooting steps you\'ve attempted...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(problemInput),
          new ActionRowBuilder().addComponents(priorityInputSupport),
          new ActionRowBuilder().addComponents(stepsInput)
        );
        break;

      case 'partnership':
        modal = new ModalBuilder()
          .setCustomId('partnership_modal')
          .setTitle('🤝 Partnership - Ticket Creation');

        const companyInput = new TextInputBuilder()
          .setCustomId('company_name')
          .setLabel('Company/Organization Name')
          .setPlaceholder('Enter your company or organization name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const priorityInputPartnership = new TextInputBuilder()
          .setCustomId('priority')
          .setLabel('Priority Level')
          .setPlaceholder('low/normal/high/urgent')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const proposalInput = new TextInputBuilder()
          .setCustomId('partnership_proposal')
          .setLabel('Partnership Proposal')
          .setPlaceholder('Describe what type of partnership you\'re proposing and what benefits it would bring...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const contactInput = new TextInputBuilder()
          .setCustomId('contact_info')
          .setLabel('Contact Information')
          .setPlaceholder('Email, website, or other contact information')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const experienceInput = new TextInputBuilder()
          .setCustomId('company_experience')
          .setLabel('Company Experience & Background')
          .setPlaceholder('Tell us about your company\'s experience and background in the industry...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(companyInput),
          new ActionRowBuilder().addComponents(priorityInputPartnership),
          new ActionRowBuilder().addComponents(proposalInput),
          new ActionRowBuilder().addComponents(contactInput),
          new ActionRowBuilder().addComponents(experienceInput)
        );
        break;

      case 'partisanship':
        modal = new ModalBuilder()
          .setCustomId('partisanship_modal')
          .setTitle('⚖️ Partisanship - Ticket Creation');

        const issueInput = new TextInputBuilder()
          .setCustomId('partisanship_issue')
          .setLabel('What is the partisanship issue?')
          .setPlaceholder('Describe the bias or political concern you want to report...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const priorityInputPartisanship = new TextInputBuilder()
          .setCustomId('priority')
          .setLabel('Priority Level')
          .setPlaceholder('low/normal/high/urgent')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const evidenceInput = new TextInputBuilder()
          .setCustomId('partisanship_evidence')
          .setLabel('Evidence or examples (Optional)')
          .setPlaceholder('Provide any evidence, screenshots, or examples...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        const actionInput = new TextInputBuilder()
          .setCustomId('partisanship_action')
          .setLabel('What action do you expect?')
          .setPlaceholder('What would you like us to do about this issue?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(issueInput),
          new ActionRowBuilder().addComponents(priorityInputPartisanship),
          new ActionRowBuilder().addComponents(evidenceInput),
          new ActionRowBuilder().addComponents(actionInput)
        );
        break;
    }

    return modal;
  }

  /**
   * Handle ticket modal submission
   * @param {ModalSubmitInteraction} interaction - Modal submit interaction
   */
  async handleTicketModal(interaction) {
    const { customId } = interaction;

    await interaction.deferReply({ ephemeral: true });

    try {
      let ticketData;

      switch (customId) {
        case 'buy_tool_modal':
          ticketData = await this.processBuyToolModal(interaction);
          break;
        case 'idea_modal':
          ticketData = await this.processIdeaModal(interaction);
          break;
        case 'support_modal':
          ticketData = await this.processSupportModal(interaction);
          break;
        case 'partnership_modal':
          ticketData = await this.processPartnershipModal(interaction);
          break;
        case 'partisanship_modal':
          ticketData = await this.processPartisanshipModal(interaction);
          break;
      }

      if (ticketData) {
        await this.createTicket(interaction, ticketData);
      }
    } catch (error) {
      logger.logError(error, { context: 'Ticket modal processing', customId });
      await interaction.editReply({
        content: '❌ Failed to create ticket. Please try again.'
      });
    }
  }

  /**
   * Process buy tool modal data
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @returns {Object} Processed ticket data
   */
  async processBuyToolModal(interaction) {
    const toolName = interaction.fields.getTextInputValue('tool_name');
    const paymentMethod = interaction.fields.getTextInputValue('payment_method');
    const priority = interaction.fields.getTextInputValue('priority');
    const rulesAccept = interaction.fields.getTextInputValue('rules_accept');
    const additionalInfo = interaction.fields.getTextInputValue('additional_info') || 'None provided';

    if (rulesAccept.toLowerCase() !== 'yes') {
      await interaction.editReply({
        content: '❌ You must accept the terms and conditions to create a ticket.'
      });
      return null;
    }

    return {
      type: 'buy-tool',
      data: { toolName, paymentMethod, priority, additionalInfo }
    };
  }

  /**
   * Process idea modal data
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @returns {Object} Processed ticket data
   */
  async processIdeaModal(interaction) {
    const ideaCategory = interaction.fields.getTextInputValue('idea_category');
    const priority = interaction.fields.getTextInputValue('priority');
    const ideaDescription = interaction.fields.getTextInputValue('idea_description');

    return {
      type: 'idea',
      data: { ideaCategory, priority, ideaDescription }
    };
  }

  /**
   * Process support modal data
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @returns {Object} Processed ticket data
   */
  async processSupportModal(interaction) {
    const problemDescription = interaction.fields.getTextInputValue('problem_description');
    const priority = interaction.fields.getTextInputValue('priority');
    const stepsTaken = interaction.fields.getTextInputValue('steps_taken') || 'None provided';

    return {
      type: 'support',
      data: { problemDescription, priority, stepsTaken }
    };
  }

  /**
   * Process partnership modal data
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @returns {Object} Processed ticket data
   */
  async processPartnershipModal(interaction) {
    const companyName = interaction.fields.getTextInputValue('company_name');
    const priority = interaction.fields.getTextInputValue('priority');
    const partnershipProposal = interaction.fields.getTextInputValue('partnership_proposal');
    const contactInfo = interaction.fields.getTextInputValue('contact_info');
    const companyExperience = interaction.fields.getTextInputValue('company_experience');

    return {
      type: 'partnership',
      data: { companyName, priority, partnershipProposal, contactInfo, companyExperience }
    };
  }

  /**
   * Process partisanship modal data
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @returns {Object} Processed ticket data
   */
  async processPartisanshipModal(interaction) {
    const partisanshipIssue = interaction.fields.getTextInputValue('partisanship_issue');
    const priority = interaction.fields.getTextInputValue('priority');
    const partisanshipEvidence = interaction.fields.getTextInputValue('partisanship_evidence') || 'None provided';
    const partisanshipAction = interaction.fields.getTextInputValue('partisanship_action');

    return {
      type: 'partisanship',
      data: { partisanshipIssue, priority, partisanshipEvidence, partisanshipAction }
    };
  }

  /**
   * Create a ticket
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @param {Object} ticketData - Ticket data
   */
  async createTicket(interaction, ticketData) {
    const guild = interaction.guild;
    const user = interaction.user;

    try {
      // Generate unique ticket ID and channel name using user id + short random suffix
      const randomSuffix = utils.generateRandomString(6).toLowerCase();
      const ticketId = `ticket-${user.id}-${randomSuffix}`;
      const channelName = `ticket-${user.id}-${randomSuffix}`.slice(0, 100);

      // Ensure bot has necessary guild permissions before attempting channel/category changes
      let botMember = guild.members.me;
      try {
        if (!botMember) botMember = await guild.members.fetch(this.client.user.id);
      } catch (e) {
        // ignore; we'll handle permission failure below
      }

      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.editReply({ content: '❌ I need the Manage Channels permission to create ticket channels. Please grant the bot the Manage Channels permission and try again.' });
        return;
      }

      // Validate category exists and is a category channel; if missing attempt to create a fallback
      let category = guild.channels.cache.get(config.TICKET_CATEGORY_ID);
      if (!category) {
        try {
          category = await guild.channels.fetch(config.TICKET_CATEGORY_ID);
        } catch (err) {
          // not cached and fetch failed; proceed to create fallback
        }
      }

      if (!category || category.type !== ChannelType.GuildCategory) {
        logger.info('Configured ticket category missing or invalid, attempting to create fallback category', { configuredCategoryId: config.TICKET_CATEGORY_ID });
        try {
          category = await guild.channels.create({
            name: 'tickets',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }
            ]
          });
        } catch (err) {
          logger.logError(err, { context: 'Creating fallback ticket category', guildId: guild.id });
          await interaction.editReply({ content: '❌ Ticket category is not configured and I could not create one. Please ensure TICKET_CATEGORY_ID is set correctly or grant me Manage Channels permission.' });
          return;
        }
      }

      // Create ticket channel with permission overwrites for the user and staff roles
      let ticketChannel;
      try {
        const overwrites = [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ];

        // Add staff role overwrites so staff can view tickets automatically
        for (const roleId of config.STAFF_ROLES) {
          try {
            overwrites.push({
              id: roleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            });
          } catch (e) {
            // ignore invalid role ids
          }
        }

        ticketChannel = await guild.channels.create({
          name: channelName,
          topic: `Ticket opened by ${user.tag} (${user.id})`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: overwrites
        });
      } catch (err) {
        // More explicit logging for permission/API issues
        logger.logError(err, { context: 'Creating ticket channel', userId: user.id, categoryId: config.TICKET_CATEGORY_ID });
        await interaction.editReply({ content: '❌ Failed to create ticket channel. Please ensure the bot has Manage Channels / Create Channels permission and that the ticket category is configured.' });
        return;
      }

      // Save ticket to database
      await Ticket.create({
        ticketId,
        channelId: ticketChannel.id,
        userId: user.id,
        username: user.username,
        type: ticketData.type,
        data: ticketData.data
      });

      // Create and send ticket embed
      const embed = this.createTicketEmbed(user, ticketData);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('claim_ticket')
          .setLabel('🙋 Claim Ticket')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('🔒 Close Ticket')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('lock_ticket')
          .setLabel('🔐 Lock')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('unlock_ticket')
          .setLabel('🔓 Unlock')
          .setStyle(ButtonStyle.Success)
      );

      await ticketChannel.send({ embeds: [embed], components: [row] });

      // Send DM to user
      await this.sendTicketDM(user, ticketChannel, ticketData);

      // Log ticket creation
      await this.logTicketCreation(ticketChannel, user, ticketData);

      // Send game options after delay
      setTimeout(async () => {
        await this.sendGameOptions(ticketChannel);
      }, config.GAME_OFFER_DELAY);

      await interaction.editReply({
        content: `✅ Ticket created successfully! ${ticketChannel}\n💌 Check your DMs for details!`
      });

      logger.logTicketEvent('created', {
        ticketId,
        userId: user.id,
        type: ticketData.type,
        channelId: ticketChannel.id
      });

    } catch (error) {
      logger.logError(error, { context: 'Ticket creation', userId: user.id });
      await interaction.editReply({
        content: '❌ Failed to create ticket. Please contact an administrator.'
      });
    }
  }

  /**
   * Create ticket embed
   * @param {User} user - Discord user
   * @param {Object} ticketData - Ticket data
   * @returns {EmbedBuilder} Ticket embed
   */
  createTicketEmbed(user, ticketData) {
    const { type, data } = ticketData;
    let embed;

    switch (type) {
      case 'buy-tool':
        embed = utils.createEmbed({
          title: '🤖 Buy Private Bot Ticket',
          description: `${config.EMOJIS.TICKET} **New Ticket Created**\n\n${user} your ticket has been created successfully! 🎉\n\n✅ **Please wait for support team assistance**\n⏰ **Support Hours:** 12 hours a day, every day\n🚀 **We aim to reply as fast as possible!**\n\n**Thank you for using our support system!** 💜\n**We appreciate your patience while waiting for assistance.**`,
          color: config.EMBED_COLOR,
          fields: [
            { name: '👤 User', value: `${user.tag}`, inline: true },
            { name: '🤖 Private Bot Requested', value: data.toolName, inline: true },
            { name: '💳 Payment Method', value: data.paymentMethod, inline: true },
            { name: '📝 Additional Info', value: data.additionalInfo, inline: false }
          ]
        });
        break;

      case 'idea':
        embed = utils.createEmbed({
          title: '💡 Idea Ticket',
          description: `${config.EMOJIS.LIGHT_BULB} **New Ticket Created**\n\n${user} your ticket has been created successfully! 🎉\n\n✅ **Please wait for support team assistance**\n⏰ **Support Hours:** 12 hours a day, every day\n🚀 **We aim to reply as fast as possible!**\n\n**Thank you for using our support system!** 💜\n**We appreciate your patience while waiting for assistance.**`,
          color: config.EMBED_COLOR,
          fields: [
            { name: '👤 User', value: `${user.tag}`, inline: true },
            { name: '📂 Category', value: data.ideaCategory, inline: true },
            { name: '💡 Description', value: data.ideaDescription, inline: false }
          ]
        });
        break;

      case 'support':
        embed = utils.createEmbed({
          title: '🛠️ Support Ticket',
          description: `${config.EMOJIS.SUPPORT} **New Ticket Created**\n\n${user} your ticket has been created successfully! 🎉\n\n✅ **Please wait for support team assistance**\n⏰ **Support Hours:** 12 hours a day, every day\n🚀 **We aim to reply as fast as possible!**\n\n**Thank you for using our support system!** 💜\n**We appreciate your patience while waiting for assistance.**`,
          color: config.EMBED_COLOR,
          fields: [
            { name: '👤 User', value: `${user.tag}`, inline: true },
            { name: '🔧 Problem', value: data.problemDescription, inline: false },
            { name: '🔍 Steps Taken', value: data.stepsTaken, inline: false }
          ]
        });
        break;

      case 'partnership':
        embed = utils.createEmbed({
          title: '🤝 Partnership Ticket',
          description: `${config.EMOJIS.BY_NOOBOT} **New Ticket Created**\n\n${user} your ticket has been created successfully! 🎉\n\n✅ **Please wait for support team assistance**\n⏰ **Support Hours:** 12 hours a day, every day\n🚀 **We aim to reply as fast as possible!**\n\n**Thank you for using our support system!** 💜\n**We appreciate your patience while waiting for assistance.**`,
          color: config.EMBED_COLOR,
          fields: [
            { name: '👤 User', value: `${user.tag}`, inline: true },
            { name: '🏢 Company', value: data.companyName, inline: true },
            { name: '📧 Contact', value: data.contactInfo, inline: true },
            { name: '🤝 Partnership Proposal', value: data.partnershipProposal, inline: false },
            { name: '📈 Company Experience', value: data.companyExperience, inline: false }
          ]
        });
        break;

      case 'partisanship':
        embed = utils.createEmbed({
          title: '⚖️ Partisanship Ticket',
          description: `${config.EMOJIS.WARN} **New Ticket Created**\n\n${user} your ticket has been created successfully! 🎉\n\n✅ **Please wait for support team assistance**\n⏰ **Support Hours:** 12 hours a day, every day\n🚀 **We aim to reply as fast as possible!**\n\n**Thank you for using our support system!** 💜\n**We appreciate your patience while waiting for assistance.**`,
          color: config.EMBED_COLOR,
          fields: [
            { name: '👤 User', value: `${user.tag}`, inline: true },
            { name: '⚖️ Issue', value: data.partisanshipIssue, inline: false },
            { name: '📋 Evidence', value: data.partisanshipEvidence, inline: false },
            { name: '🎯 Expected Action', value: data.partisanshipAction, inline: false }
          ]
        });
        break;
    }

    return embed;
  }

  /**
   * Send ticket creation DM to user
   * @param {User} user - Discord user
   * @param {Channel} ticketChannel - Ticket channel
   * @param {Object} ticketData - Ticket data
   */
  async sendTicketDM(user, ticketChannel, ticketData) {
    try {
      const dmEmbed = utils.createEmbed({
        title: '🎟️ Ticket Created Successfully!',
        description: `Hey ${user.username}! 👋\n\nYour support ticket has been created successfully in **${ticketChannel.guild.name}**!\n\n🔗 **Ticket Channel:** ${ticketChannel}\n⏰ **Created:** ${utils.formatTimestamp(Date.now())}\n\n✨ **What happens next?**\n• Our support team will assist you shortly\n• You'll receive notifications for any updates\n• You can play mini-games while waiting!\n\n**Thank you for choosing our support system!** 💜\n*We're here to help you with anything you need.*`,
        color: config.EMBED_COLOR
      });

      await user.send({ embeds: [dmEmbed] });
    } catch (error) {
      logger.logError(error, { context: 'Sending ticket DM', userId: user.id });
    }
  }

  /**
   * Log ticket creation
   * @param {Channel} ticketChannel - Ticket channel
   * @param {User} user - Discord user
   * @param {Object} ticketData - Ticket data
   */
  async logTicketCreation(ticketChannel, user, ticketData) {
    const logChannel = ticketChannel.guild.channels.cache.get(config.OPEN_LOG_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = utils.createEmbed({
        title: '🎟️ New Ticket Created',
        description: `**User:** ${user} (${user.tag})\n**User ID:** ${user.id}\n**Channel:** ${ticketChannel}\n**Type:** ${ticketData.type.toUpperCase()}\n**Created:** ${utils.formatTimestamp(Date.now())}`,
        color: config.EMBED_COLOR
      });

      await logChannel.send({ embeds: [logEmbed] });
    }
  }

  /**
   * Send game options to ticket channel
   * @param {Channel} ticketChannel - Ticket channel
   */
  async sendGameOptions(ticketChannel) {
    const gameEmbed = utils.createEmbed({
      title: '🎮 Want to play mini-games while waiting for support?',
      description: 'Choose a game to play while you wait! 🎯',
      color: config.EMBED_COLOR
    });

    const gameButtons = [
      new ButtonBuilder()
        .setCustomId('game_tictactoe')
        .setLabel('⭕ Tic Tac Toe')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('game_math')
        .setLabel('🧮 Math Challenge')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('game_guess')
        .setLabel('🎲 Number Guessing')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('game_rps')
        .setLabel('✂️ Rock Paper Scissors')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('game_trivia')
        .setLabel('🧠 Trivia Quiz')
        .setStyle(ButtonStyle.Primary)
    ];

    const gameRow = new ActionRowBuilder().addComponents(gameButtons);

    await ticketChannel.send({
      embeds: [gameEmbed],
      components: [gameRow]
    });
  }

  /**
   * Handle claim ticket button
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleClaimTicket(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have the required role to claim tickets.',
        flags: 64
      });
    }

    const ticket = await Ticket.findByChannelId(interaction.channel.id);
    if (!ticket) {
      return await interaction.reply({
        content: '❌ Could not find ticket information.',
        flags: 64
      });
    }

    if (ticket.status !== 'open') {
      return await interaction.reply({
        content: '❌ This ticket has already been claimed or closed.',
        flags: 64
      });
    }

    const claimed = await Ticket.claim(ticket.ticketId, interaction.user.id);
    if (!claimed) {
      return await interaction.reply({
        content: '❌ Failed to claim ticket.',
        flags: 64
      });
    }

    const claimEmbed = utils.createEmbed({
      title: '🙋 Ticket Claimed',
      description: `This ticket has been claimed by ${interaction.user}`,
      color: config.EMBED_COLOR
    });

    const closeButton = new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('🔒 Close Ticket')
      .setStyle(ButtonStyle.Danger);

    const claimedButton = new ButtonBuilder()
      .setCustomId('claimed_disabled')
      .setLabel('✅ Already Claimed')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);

    const row = new ActionRowBuilder().addComponents(claimedButton, closeButton);

    await interaction.update({ components: [row] });
    await interaction.followUp({ embeds: [claimEmbed] });

    // Log claim
    const logChannel = interaction.guild.channels.cache.get(config.OPEN_LOG_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = utils.createEmbed({
        title: '🙋 Ticket Claimed',
        description: `**Claimed by:** ${interaction.user} (${interaction.user.tag})\n**Staff ID:** ${interaction.user.id}\n**Channel:** ${interaction.channel}\n**Claimed:** ${utils.formatTimestamp(Date.now())}`,
        color: config.EMBED_COLOR
      });

      await logChannel.send({ embeds: [logEmbed] });
    }

    logger.logTicketEvent('claimed', {
      ticketId: ticket.ticketId,
      staffId: interaction.user.id,
      channelId: interaction.channel.id
    });

    // Optionally auto-assign next ticket to least busy staff
    try {
      if (config.AUTO_ASSIGN_TICKETS) {
        await this.autoAssignStaff(interaction.guild);
      }
    } catch (e) {
      logger.logError(e, { context: 'Auto-assign after claim' });
    }
  }

  /**
   * Find the least-busy staff member by counting open tickets claimed_by
   * @param {Guild} guild
   */
  async findLeastBusyStaff(guild) {
    // naive: iterate STAFF_ROLES members and count claimed tickets in DB
    const staffCounts = [];
    for (const roleId of config.STAFF_ROLES) {
      try {
        const role = guild.roles && guild.roles.cache.get(roleId);
        if (!role) continue;
        for (const member of role.members.values()) {
          const userId = member.id;
          const active = await Ticket.findByUserId(userId, { status: 'claimed' }).catch(() => []);
          staffCounts.push({ userId, count: active.length });
        }
      } catch (e) {
        // ignore per-role failures
      }
    }

    staffCounts.sort((a, b) => a.count - b.count);
    return staffCounts.length > 0 ? staffCounts[0].userId : null;
  }

  /**
   * Auto assign a ticket to the least-busy staff member
   * @param {Guild} guild
   */
  async autoAssignStaff(guild) {
    const userId = await this.findLeastBusyStaff(guild);
    if (!userId) return null;
    // Attempt to DM staff to notify - don't fail flow on error
    try {
      const user = await this.client.users.fetch(userId);
      await user.send({ content: 'You have been auto-assigned a ticket. Check your server tickets.' }).catch(() => null);
      return userId;
    } catch (e) {
      return null;
    }
  }

  /**
   * Handle lock ticket button
   * @param {ButtonInteraction} interaction
   */
  async handleLockTicket(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({ content: '❌ You do not have the required role to lock tickets.', flags: 64 });
    }

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true });
      await interaction.reply({ content: '🔐 Ticket locked. Only staff and the opener can view this channel.' , flags: 64});
    } catch (e) {
      logger.logError(e, { context: 'Locking ticket', channelId: interaction.channel.id });
      await interaction.reply({ content: '❌ Failed to lock ticket.', flags: 64 });
    }
  }

  /**
   * Handle unlock ticket button
   * @param {ButtonInteraction} interaction
   */
  async handleUnlockTicket(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({ content: '❌ You do not have the required role to unlock tickets.', flags: 64 });
    }

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: null });
      await interaction.reply({ content: '🔓 Ticket unlocked. Channel visibility restored.', flags: 64 });
    } catch (e) {
      logger.logError(e, { context: 'Unlocking ticket', channelId: interaction.channel.id });
      await interaction.reply({ content: '❌ Failed to unlock ticket.', flags: 64 });
    }
  }

  /**
   * Handle close ticket button
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleCloseTicket(interaction) {
    if (!utils.hasStaffPermissions(interaction.member)) {
      return await interaction.reply({
        content: '❌ You do not have the required role to close tickets.',
        flags: 64
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('close_reason_modal')
      .setTitle('🔒 Close Ticket - Reason Required');

    const reasonInput = new TextInputBuilder()
      .setCustomId('close_reason')
      .setLabel('Reason for closing the ticket')
      .setPlaceholder('Please provide a reason for closing this ticket...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(row);
    await interaction.showModal(modal);
  }

  /**
   * Handle close reason modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleCloseReasonModal(interaction) {
    const reason = interaction.fields.getTextInputValue('close_reason');
    await this.closeTicketWithReason(interaction, reason);
  }

  /**
   * Close ticket with reason
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @param {string} reason - Close reason
   */
  async closeTicketWithReason(interaction, reason) {
    const channel = interaction.channel;
    const ticket = await Ticket.findByChannelId(channel.id);

    if (!ticket) {
      return await interaction.reply({
        content: '❌ Could not find ticket information.',
        flags: 64
      });
    }

    // Find ticket owner
    let user = null;
    if (channel.topic) {
      const userIdMatch = channel.topic.match(/\((\d+)\)$/);
      if (userIdMatch) {
        try {
          user = await this.client.users.fetch(userIdMatch[1]);
        } catch (error) {
          logger.logError(error, { context: 'Fetching ticket owner', userId: userIdMatch[1] });
        }
      }
    }

    // Send rating request to user
    if (user) {
      await this.sendRatingRequest(user);
    }

    // Save transcript if enabled
    let transcriptPath = null;
    if (config.TICKET_TRANSCRIPT_ENABLED) {
      transcriptPath = await this.saveTranscript(channel, ticket);
    }

    // Close ticket in database
    const closed = await Ticket.close(ticket.ticketId, interaction.user.id, reason, transcriptPath);
    if (!closed) {
      return await interaction.reply({
        content: '❌ Failed to close ticket.',
        flags: 64
      });
    }

    // Send close message
    const embed = utils.createEmbed({
      title: '🔒 Ticket Closing',
      description: `This ticket is being closed...\n**Reason:** ${reason}\n\nChannel will be deleted in ${config.TICKET_CLOSE_DELAY / 1000} seconds.`,
      color: config.EMBED_COLOR
    });

    await interaction.reply({ embeds: [embed] });

    // Log closure
    const logChannel = interaction.guild.channels.cache.get(config.CLOSE_LOG_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = utils.createEmbed({
        title: '🔒 Ticket Closed',
        description: `**Closed by:** ${interaction.user} (${interaction.user.tag})\n**Staff ID:** ${interaction.user.id}\n**User:** ${user ? user.tag : ticket.username}\n**User ID:** ${user ? user.id : ticket.userId}\n**Channel:** ${channel.name}\n**Reason:** ${reason}\n**Closed:** ${utils.formatTimestamp(Date.now())}`,
        color: config.EMBED_COLOR
      });

      await logChannel.send({ embeds: [logEmbed] });
    }

    // Delete channel after delay
    setTimeout(async () => {
      try {
        await channel.delete();
      } catch (error) {
        logger.logError(error, { context: 'Deleting ticket channel', channelId: channel.id });
      }
    }, config.TICKET_CLOSE_DELAY);

    logger.logTicketEvent('closed', {
      ticketId: ticket.ticketId,
      staffId: interaction.user.id,
      reason,
      transcriptPath
    });
  }

  /**
   * Send rating request to user
   * @param {User} user - Discord user
   */
  async sendRatingRequest(user) {
    try {
      const ratingEmbed = utils.createEmbed({
        title: '⭐ Please Rate Your Support Experience',
        description: 'How would you rate the support you received?\nYour feedback helps us improve our service!',
        color: config.EMBED_COLOR
      });

      const ratingButtons = [];
      for (let i = 1; i <= 5; i++) {
        ratingButtons.push(
          new ButtonBuilder()
            .setCustomId(`rate_${i}`)
            .setLabel(`${i}⭐`)
            .setStyle(i <= 2 ? ButtonStyle.Danger : i === 3 ? ButtonStyle.Secondary : ButtonStyle.Success)
        );
      }

      const ratingRow = new ActionRowBuilder().addComponents(ratingButtons);

      await user.send({
        embeds: [ratingEmbed],
        components: [ratingRow]
      });

      logger.info(`Rating DM sent to ${user.tag}`, { userId: user.id });
    } catch (error) {
      logger.logError(error, { context: 'Sending rating DM', userId: user.id });
    }
  }

  /**
   * Handle rating submission
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleRating(interaction) {
    const rating = parseInt(interaction.customId.split('_')[1]);

    // Add rating to database
    await User.addRating(interaction.user.id, rating);
    await Analytics.logEvent('rating_submitted', rating);

    // Disable all rating buttons
    const disabledButtons = [];
    for (let i = 1; i <= 5; i++) {
      const button = new ButtonBuilder()
        .setCustomId(`rating_disabled_${i}`)
        .setLabel(`${i}⭐`)
        .setStyle(i <= 2 ? ButtonStyle.Danger : i === 3 ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(true);
      disabledButtons.push(button);
    }

    const disabledRow = new ActionRowBuilder().addComponents(disabledButtons);

    await interaction.update({
      components: [disabledRow]
    });

    await interaction.followUp({
      content: `Thank you for rating our support! You gave us ${rating} star${rating !== 1 ? 's' : ''}! ⭐`,
      flags: 64
    });

    logger.user(`User rated support: ${rating} stars`, {
      userId: interaction.user.id,
      rating
    });

    // Send rating to star log channel if available. Try interaction guild first, then
    // fall back to the guild of the most recent closed ticket for this user.
    try {
      const starEmbed = utils.createEmbed({
        title: '⭐ Support Rating Received',
        description: `A user has rated their support experience.`,
        color: config.SUCCESS_COLOR,
        fields: [
          { name: '👤 User', value: `${interaction.user.tag || interaction.user.username || interaction.user.id} (${interaction.user.id})`, inline: true },
          { name: '⭐ Rating', value: `${rating} / 5`, inline: true }
        ]
      });

      // Determine best target channel for star logs.
      let targetLogChannel = null;

      // 1) If a global star log is configured, prefer it.
      if (config.STAR_LOG_GLOBAL_ID && this.client && this.client.channels) {
        try {
          targetLogChannel = this.client.channels.cache.get(config.STAR_LOG_GLOBAL_ID) || await this.client.channels.fetch(config.STAR_LOG_GLOBAL_ID).catch(() => null);
        } catch (e) {
          targetLogChannel = null;
        }
      }

      // 2) If still not found, try configured STAR_LOG_CHANNEL_ID globally (cache then fetch)
      if (!targetLogChannel && this.client && this.client.channels) {
        try {
          targetLogChannel = this.client.channels.cache.get(config.STAR_LOG_CHANNEL_ID) || await this.client.channels.fetch(config.STAR_LOG_CHANNEL_ID).catch(() => null);
        } catch (e) {
          targetLogChannel = null;
        }
      }

      // 3) Guild-local lookup
      if (!targetLogChannel && interaction.guild) {
        targetLogChannel = interaction.guild.channels.cache.get(config.STAR_LOG_CHANNEL_ID) || null;
      }

      // 4) If we still don't have a channel, try to find the user's most recent closed ticket and use that ticket's guild
      let ticket = null;
      try {
        const recent = await Ticket.findByUserId(interaction.user.id, { status: 'closed', limit: 1 }).catch(() => []);
        ticket = Array.isArray(recent) && recent.length > 0 ? recent[0] : null;
        if (ticket && this.client && this.client.channels && ticket.channelId) {
          try {
            const ch = await this.client.channels.fetch(ticket.channelId).catch(() => null);
            if (ch && ch.guild) {
              targetLogChannel = ch.guild.channels.cache.get(config.STAR_LOG_CHANNEL_ID) || targetLogChannel;
            }
          } catch (err) {
            // ignore
          }
        }
      } catch (err) {
        // ignore
      }

      // Append ticket info if available
      if (ticket) {
        try {
          starEmbed.addFields([{ name: '🎫 Ticket', value: ticket.ticketId, inline: true }]);
          if (ticket.transcriptPath) starEmbed.addFields([{ name: '📁 Transcript', value: ticket.transcriptPath, inline: false }]);
          if (ticket.claimedBy) starEmbed.addFields([{ name: '👨‍💼 Staff', value: `${ticket.claimedBy}`, inline: true }]);
        } catch (e) {
          // ignore field add errors
        }
      }

      if (targetLogChannel) {
        await targetLogChannel.send({ embeds: [starEmbed] });
      } else {
        logger.info('Star log channel not found for rating; skipping star log upload', { userId: interaction.user.id });
      }
    } catch (err) {
      logger.logError(err, { context: 'Sending rating to star log', userId: interaction.user.id });
    }
  }

  /**
   * Save ticket transcript
   * @param {Channel} channel - Ticket channel
   * @param {Object} ticket - Ticket data
   * @returns {string|null} Transcript file path
   */
  async saveTranscript(channel, ticket) {
    try {
      const transcriptDir = path.join('./data/transcripts');
      await utils.ensureDirectoryExists(transcriptDir);

      const transcriptPath = path.join(transcriptDir, `${ticket.ticketId}.txt`);
      let transcript = `Ticket Transcript: ${ticket.ticketId}\n`;
      transcript += `Created: ${utils.formatTimestamp(ticket.createdAt)}\n`;
      transcript += `User: ${ticket.username} (${ticket.userId})\n`;
      transcript += `Type: ${ticket.type}\n\n`;

      // Fetch messages
      const messages = await channel.messages.fetch({ limit: 100 });
      const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      for (const message of sortedMessages.values()) {
        const timestamp = utils.formatTimestamp(message.createdTimestamp, 'T');
        const author = message.author ? `${message.author.username}#${message.author.discriminator}` : 'Unknown';
        transcript += `[${timestamp}] ${author}: ${message.content}\n`;

        // Include attachments
        if (message.attachments.size > 0) {
          transcript += 'Attachments:\n';
          message.attachments.forEach(attachment => {
            transcript += `  - ${attachment.name} (${attachment.url})\n`;
          });
        }
      }

      await fs.writeFile(transcriptPath, transcript, 'utf8');

      // Attempt to upload transcript to configured close-log channel for easy access
      try {
        const logChannel = channel.guild.channels.cache.get(config.CLOSE_LOG_CHANNEL_ID);
        if (logChannel) {
          const sent = await logChannel.send({ content: `Transcript for ${ticket.ticketId} (user: ${ticket.username} | ${ticket.userId})`, files: [transcriptPath] });
          const attachment = sent.attachments && sent.attachments.first();
          if (attachment) {
            return attachment.url;
          }
        }
      } catch (uploadErr) {
        logger.logError(uploadErr, { context: 'Uploading transcript to log channel', ticketId: ticket.ticketId });
        // fallback to returning local path
      }

      return transcriptPath;
    } catch (error) {
      logger.logError(error, { context: 'Saving transcript', ticketId: ticket.ticketId });
      return null;
    }
  }

  /**
   * Clean up rate limits periodically
   */
  cleanupRateLimits() {
    utils.cleanupRateLimits(this.rateLimits);
  }
}

module.exports = TicketHandler;
