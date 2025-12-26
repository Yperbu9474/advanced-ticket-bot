const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { logger } = require('../logger');

class Hangman {
  constructor() {
    this.games = new Map();
    this.words = [
      'COMPUTER', 'PROGRAMMING', 'JAVASCRIPT', 'PYTHON', 'DATABASE',
      'ALGORITHM', 'FUNCTION', 'VARIABLE', 'ARRAY', 'BOOLEAN',
      'STRING', 'INTEGER', 'OBJECT', 'METHOD', 'CLASS',
      'INTERFACE', 'INHERITANCE', 'POLYMORPHISM', 'ENCRYPTION', 'FIREWALL',
      'NETWORK', 'PROTOCOL', 'BANDWIDTH', 'LATENCY', 'ROUTER',
      'SWITCH', 'HUB', 'MODEM', 'ETHERNET', 'WIFI'
    ];
  }

  async startGame(interaction) {
    const gameId = `hangman_${interaction.user.id}_${Date.now()}`;
    const word = this.getRandomWord();
    const displayWord = '_'.repeat(word.length);

    this.games.set(gameId, {
      playerId: interaction.user.id,
      word: word,
      displayWord: displayWord,
      guessedLetters: new Set(),
      wrongGuesses: 0,
      maxWrongGuesses: 6,
      gameOver: false
    });

    const embed = this.createGameEmbed(gameId);

    await interaction.reply({
      embeds: [embed],
      components: [this.createLetterButtons(gameId)]
    });

    // Set timeout for game (5 minutes)
    setTimeout(async () => {
      const game = this.games.get(gameId);
      if (game && !game.gameOver) {
        game.gameOver = true;
        this.games.delete(gameId);

        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ Time\'s Up!')
          .setDescription(`You ran out of time! The word was: **${game.word}**`)
          .setColor(0x574d3c);

        const playAgainButton = new ButtonBuilder()
          .setCustomId('play_again_hangman')
          .setLabel('🔄 Play Again')
          .setStyle(ButtonStyle.Primary);

        const changeGameButton = new ButtonBuilder()
          .setCustomId('change_game')
          .setLabel('🎮 Change Game')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(playAgainButton, changeGameButton);

        try {
          await interaction.editReply({
            embeds: [timeoutEmbed],
            components: [row]
          });
        } catch (error) {
          logger.logError(error, { context: 'Hangman timeout edit' });
        }
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  async handleGuess(interaction, letter, gameId) {
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

    letter = letter.toUpperCase();

    if (game.guessedLetters.has(letter)) {
      return await interaction.reply({
        content: '❌ You already guessed that letter!',
        ephemeral: true
      });
    }

    game.guessedLetters.add(letter);

    if (game.word.includes(letter)) {
      // Correct guess
      let newDisplayWord = '';
      for (let i = 0; i < game.word.length; i++) {
        if (game.word[i] === letter) {
          newDisplayWord += letter;
        } else {
          newDisplayWord += game.displayWord[i];
        }
      }
      game.displayWord = newDisplayWord;

      // Check if won
      if (!game.displayWord.includes('_')) {
        game.gameOver = true;
        this.games.delete(gameId);

        const winEmbed = new EmbedBuilder()
          .setTitle('🎉 Congratulations!')
          .setDescription(`You won! The word was: **${game.word}**\n\nWrong guesses: ${game.wrongGuesses}/${game.maxWrongGuesses}`)
          .setColor(0x00ff00);

        const playAgainButton = new ButtonBuilder()
          .setCustomId('play_again_hangman')
          .setLabel('🔄 Play Again')
          .setStyle(ButtonStyle.Primary);

        const changeGameButton = new ButtonBuilder()
          .setCustomId('change_game')
          .setLabel('🎮 Change Game')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(playAgainButton, changeGameButton);

        await interaction.update({
          embeds: [winEmbed],
          components: [row]
        });

        logger.info('Hangman game won', {
          playerId: game.playerId,
          word: game.word,
          wrongGuesses: game.wrongGuesses
        });

        return;
      }
    } else {
      // Wrong guess
      game.wrongGuesses++;

      // Check if lost
      if (game.wrongGuesses >= game.maxWrongGuesses) {
        game.gameOver = true;
        this.games.delete(gameId);

        const loseEmbed = new EmbedBuilder()
          .setTitle('💀 Game Over!')
          .setDescription(`You lost! The word was: **${game.word}**\n\nWrong guesses: ${game.wrongGuesses}/${game.maxWrongGuesses}`)
          .setColor(0xff0000);

        const playAgainButton = new ButtonBuilder()
          .setCustomId('play_again_hangman')
          .setLabel('🔄 Play Again')
          .setStyle(ButtonStyle.Primary);

        const changeGameButton = new ButtonBuilder()
          .setCustomId('change_game')
          .setLabel('🎮 Change Game')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(playAgainButton, changeGameButton);

        await interaction.update({
          embeds: [loseEmbed],
          components: [row]
        });

        logger.info('Hangman game lost', {
          playerId: game.playerId,
          word: game.word,
          wrongGuesses: game.wrongGuesses
        });

        return;
      }
    }

    // Continue game
    const embed = this.createGameEmbed(gameId);
    await interaction.update({
      embeds: [embed],
      components: [this.createLetterButtons(gameId)]
    });
  }

  createGameEmbed(gameId) {
    const game = this.games.get(gameId);
    const hangmanStages = [
      '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========\n```',
      '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========\n```',
      '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========\n```',
      '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========\n```',
      '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========\n```',
      '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========\n```',
      '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========\n```'
    ];

    const embed = new EmbedBuilder()
      .setTitle('🎯 Hangman')
      .setDescription(`${hangmanStages[game.wrongGuesses]}\n\n**Word:** ${game.displayWord.split('').join(' ')}\n\n**Wrong guesses:** ${game.wrongGuesses}/${game.maxWrongGuesses}\n**Guessed letters:** ${Array.from(game.guessedLetters).join(', ') || 'None'}`)
      .setColor(0x574d3c)
      .setFooter({ text: 'Click a letter to guess!' });

    return embed;
  }

  createLetterButtons(gameId) {
    const game = this.games.get(gameId);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const buttons = [];

    for (let i = 0; i < alphabet.length; i++) {
      const letter = alphabet[i];
      const isGuessed = game.guessedLetters.has(letter);

      const button = new ButtonBuilder()
        .setCustomId(`hangman_${letter}_${gameId}`)
        .setLabel(letter)
        .setStyle(isGuessed ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(isGuessed);

      buttons.push(button);
    }

    // Create rows of 6 buttons each (A-F, G-L, M-R, S-X, Y-Z)
    const rows = [];
    for (let i = 0; i < buttons.length; i += 6) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 6)));
    }

    return rows;
  }

  getRandomWord() {
    return this.words[Math.floor(Math.random() * this.words.length)];
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

module.exports = Hangman;
