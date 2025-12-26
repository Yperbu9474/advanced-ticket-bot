const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { logger } = require('../logger');

class Trivia {
  constructor() {
    this.games = new Map();
    this.questions = [
      {
        question: "What is the capital of France?",
        answers: ["Paris", "London", "Berlin", "Madrid"],
        correct: 0
      },
      {
        question: "Which programming language is known as the 'mother of all languages'?",
        answers: ["C", "Python", "Java", "Assembly"],
        correct: 0
      },
      {
        question: "What does CPU stand for?",
        answers: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Computer Processing Unit"],
        correct: 0
      },
      {
        question: "Which company created the Windows operating system?",
        answers: ["Microsoft", "Apple", "Google", "IBM"],
        correct: 0
      },
      {
        question: "What is the largest planet in our solar system?",
        answers: ["Jupiter", "Saturn", "Mars", "Earth"],
        correct: 0
      },
      {
        question: "Which data structure follows LIFO (Last In, First Out) principle?",
        answers: ["Stack", "Queue", "Array", "Linked List"],
        correct: 0
      },
      {
        question: "What does HTML stand for?",
        answers: ["HyperText Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyper Transfer Markup Language"],
        correct: 0
      },
      {
        question: "Which algorithm is used for finding the shortest path in a graph?",
        answers: ["Dijkstra's Algorithm", "Bubble Sort", "Binary Search", "Quick Sort"],
        correct: 0
      },
      {
        question: "What is the time complexity of binary search?",
        answers: ["O(log n)", "O(n)", "O(n²)", "O(1)"],
        correct: 0
      },
      {
        question: "Which protocol is used for secure communication over the internet?",
        answers: ["HTTPS", "HTTP", "FTP", "SMTP"],
        correct: 0
      }
    ];
  }

  async startGame(interaction) {
    const gameId = `trivia_${interaction.user.id}_${Date.now()}`;
    const question = this.getRandomQuestion();

    this.games.set(gameId, {
      playerId: interaction.user.id,
      question: question,
      startTime: Date.now(),
      answered: false
    });

    const embed = new EmbedBuilder()
      .setTitle('🧠 Trivia Challenge')
      .setDescription(`**Question:** ${question.question}\n\nChoose the correct answer!`)
      .setColor(0x574d3c)
      .setFooter({ text: 'You have 30 seconds to answer!' });

    const buttons = question.answers.map((answer, index) => {
      const letter = String.fromCharCode(65 + index); // A, B, C, D
      return new ButtonBuilder()
        .setCustomId(`trivia_${index}_${gameId}`)
        .setLabel(`${letter}. ${answer}`)
        .setStyle(ButtonStyle.Secondary);
    });

    const row1 = new ActionRowBuilder().addComponents(buttons[0], buttons[1]);
    const row2 = new ActionRowBuilder().addComponents(buttons[2], buttons[3]);

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2]
    });

    // Set timeout for game
    setTimeout(async () => {
      const game = this.games.get(gameId);
      if (game && !game.answered) {
        game.answered = true;
        this.games.delete(gameId);

        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ Time\'s Up!')
          .setDescription(`The correct answer was: **${question.answers[question.correct]}**\n\nYou took too long to answer!`)
          .setColor(0x574d3c);

        const playAgainButton = new ButtonBuilder()
          .setCustomId('play_again_trivia')
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
          logger.logError(error, { context: 'Trivia timeout edit' });
        }
      }
    }, 30000);
  }

  async handleAnswer(interaction, answerIndex, gameId) {
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

    if (game.answered) {
      return await interaction.reply({
        content: '❌ This question has already been answered!',
        ephemeral: true
      });
    }

    game.answered = true;
    const isCorrect = answerIndex === game.question.correct;
    const timeTaken = Date.now() - game.startTime;
    this.games.delete(gameId);

    const resultEmbed = new EmbedBuilder()
      .setTitle(isCorrect ? '🎉 Correct!' : '❌ Wrong!')
      .setColor(isCorrect ? 0x00ff00 : 0xff0000);

    let description = `**Your answer:** ${game.question.answers[answerIndex]}\n`;
    description += `**Correct answer:** ${game.question.answers[game.question.correct]}\n`;
    description += `**Time taken:** ${Math.round(timeTaken / 1000)} seconds\n\n`;

    if (isCorrect) {
      description += 'Great job! You got it right! 🧠';
    } else {
      description += 'Better luck next time! Keep learning! 📚';
    }

    resultEmbed.setDescription(description);

    const playAgainButton = new ButtonBuilder()
      .setCustomId('play_again_trivia')
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

    logger.info('Trivia game completed', {
      playerId: game.playerId,
      question: game.question.question,
      answerIndex: answerIndex,
      correctIndex: game.question.correct,
      isCorrect: isCorrect,
      timeTaken: timeTaken
    });
  }

  getRandomQuestion() {
    return this.questions[Math.floor(Math.random() * this.questions.length)];
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

module.exports = Trivia;
