const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { logger } = require('../logger');

class RockPaperScissors {
  constructor() {
    this.games = new Map();
  }

  async startGame(interaction) {
    const gameId = `rps_${interaction.user.id}_${Date.now()}`;

    this.games.set(gameId, {
      playerId: interaction.user.id,
      playerChoice: null,
      botChoice: null,
      gameOver: false
    });

    const embed = new EmbedBuilder()
      .setTitle('🪨 Rock Paper Scissors')
      .setDescription('Choose your move! You have 30 seconds to decide.')
      .setColor(0x574d3c)
      .setFooter({ text: 'Make your choice below!' });

    const rockButton = new ButtonBuilder()
      .setCustomId(`rps_rock_${gameId}`)
      .setLabel('🪨 Rock')
      .setStyle(ButtonStyle.Primary);

    const paperButton = new ButtonBuilder()
      .setCustomId(`rps_paper_${gameId}`)
      .setLabel('📄 Paper')
      .setStyle(ButtonStyle.Primary);

    const scissorsButton = new ButtonBuilder()
      .setCustomId(`rps_scissors_${gameId}`)
      .setLabel('✂️ Scissors')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(rockButton, paperButton, scissorsButton);

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });

    // Set timeout for game
    setTimeout(async () => {
      const game = this.games.get(gameId);
      if (game && !game.gameOver) {
        game.gameOver = true;
        this.games.delete(gameId);

        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ Time\'s Up!')
          .setDescription('You took too long to choose! Game cancelled.')
          .setColor(0x574d3c);

        try {
          await interaction.editReply({
            embeds: [timeoutEmbed],
            components: []
          });
        } catch (error) {
          logger.logError(error, { context: 'RPS timeout edit' });
        }
      }
    }, 30000);
  }

  async handleChoice(interaction, choice, gameId) {
    const game = this.games.get(gameId);
    if (!game) {
      return await interaction.reply({
        content: '❌ Game not found! This game may have expired.',
        ephemeral: true
      });
    }

    if (game.playerId !== interaction.user.id) {
      return await interaction.reply({
        content: '❌ This is not your game!',
        ephemeral: true
      });
    }

    if (game.gameOver) {
      return await interaction.reply({
        content: '❌ This game is already finished!',
        ephemeral: true
      });
    }

    game.playerChoice = choice;
    game.botChoice = this.getRandomChoice();
    game.gameOver = true;

    const result = this.determineWinner(game.playerChoice, game.botChoice);
    this.games.delete(gameId);

    const resultEmbed = new EmbedBuilder()
      .setTitle('🪨 Rock Paper Scissors - Results')
      .setColor(0x574d3c);

    let description = `**Your choice:** ${this.formatChoice(game.playerChoice)}\n`;
    description += `**Bot's choice:** ${this.formatChoice(game.botChoice)}\n\n`;

    if (result === 'win') {
      resultEmbed.setDescription(description + '🎉 **You win!** 🎉');
    } else if (result === 'lose') {
      resultEmbed.setDescription(description + '😔 **You lose!** Better luck next time!');
    } else {
      resultEmbed.setDescription(description + '🤝 **It\'s a tie!** 🤝');
    }

    const playAgainButton = new ButtonBuilder()
      .setCustomId('play_again_rps')
      .setLabel('🔄 Play Again')
      .setStyle(ButtonStyle.Primary);

    const changeGameButton = new ButtonBuilder()
      .setCustomId('change_game')
      .setLabel('🎮 Change Game')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(playAgainButton, changeGameButton);

    await interaction.update({
      embeds: [resultEmbed],
      components: [row]
    });

    logger.info('RPS game completed', {
      playerId: game.playerId,
      playerChoice: game.playerChoice,
      botChoice: game.botChoice,
      result: result
    });
  }

  getRandomChoice() {
    const choices = ['rock', 'paper', 'scissors'];
    return choices[Math.floor(Math.random() * choices.length)];
  }

  determineWinner(playerChoice, botChoice) {
    if (playerChoice === botChoice) {
      return 'tie';
    }

    const winConditions = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper'
    };

    return winConditions[playerChoice] === botChoice ? 'win' : 'lose';
  }

  formatChoice(choice) {
    const emojis = {
      rock: '🪨 Rock',
      paper: '📄 Paper',
      scissors: '✂️ Scissors'
    };
    return emojis[choice] || choice;
  }

  cleanup(userId) {
    // Clean up any games for this user
    for (const [gameId, game] of this.games.entries()) {
      if (game.playerId === userId) {
        this.games.delete(gameId);
      }
    }
  }
}

module.exports = RockPaperScissors;
