// Game handling logic for mini-games

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const config = require('../config');
const utils = require('../utils');
const User = require('../models/user');
const Analytics = require('../models/analytics');
const { logger } = require('../logger');

const activeGames = new Map();
const rateLimits = new Map();

class GameHandler {

  constructor(client) {
    this.client = client;
  }

  /**
   * Handle game selection
   * @param {StringSelectMenuInteraction} interaction - Select menu interaction
   */
  async handleGameSelect(interaction) {
    const gameType = interaction.values[0];

    // Check rate limit
    if (!utils.checkRateLimit(rateLimits, interaction.user.id, config.GAME_RATE_LIMIT)) {
      return await interaction.reply({
        content: `❌ You're playing games too quickly. Please wait ${config.GAME_RATE_LIMIT.WINDOW_MS / 1000} seconds between game interactions.`,
        flags: 64
      });
    }

    // Check if user already has an active game
    if (activeGames.has(interaction.user.id)) {
      return await interaction.reply({
        content: '❌ You already have an active game. Finish it first!',
        flags: 64
      });
    }

    switch (gameType) {
      case 'tictactoe':
        await this.startTicTacToe(interaction);
        break;
      case 'math':
        await this.startMathGame(interaction);
        break;
      case 'guess':
        await this.startNumberGuess(interaction);
        break;
      case 'rps':
        await this.startRockPaperScissors(interaction);
        break;
      case 'trivia':
        await this.startTrivia(interaction);
        break;
      case 'hangman':
        await this.startHangman(interaction);
        break;
    }
  }

  /**
   * Handle game button interactions
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleGameButton(interaction) {
    const { customId } = interaction;

    if (customId.startsWith('game_')) {
      const gameType = customId.split('_')[1];
      await this.handleGameSelect({ values: [gameType], reply: interaction.reply.bind(interaction), user: interaction.user });
    } else if (customId.startsWith('ttt_')) {
      await this.handleTicTacToeMove(interaction);
    } else if (customId.startsWith('rps_')) {
      await this.handleRockPaperScissors(interaction);
    } else if (customId.startsWith('trivia_')) {
      await this.handleTrivia(interaction);
    } else if (customId.startsWith('hangman_')) {
      await this.handleHangman(interaction);
    } else if (customId.startsWith('play_again_')) {
      await this.handlePlayAgain(interaction);
    } else if (customId === 'change_game') {
      await this.handleChangeGame(interaction);
    }
  }

  /**
   * Start Tic Tac Toe game
   * @param {Interaction} interaction - Discord interaction
   */
  async startTicTacToe(interaction) {
    const gameId = `tictactoe_${interaction.user.id}_${Date.now()}`;

    const gameState = {
      id: gameId,
      type: 'tictactoe',
      userId: interaction.user.id,
      board: Array(9).fill(null),
      currentPlayer: 'X',
      aiPlayer: 'O',
      difficulty: 'normal',
      startedAt: Date.now()
    };

    activeGames.set(interaction.user.id, gameState);

    const embed = this.createTicTacToeEmbed(gameState);

    const components = this.createTicTacToeButtons(gameState);

    await interaction.reply({
      embeds: [embed],
      components: components
    });

    await Analytics.logEvent('game_started', 1, { type: 'tictactoe' });
    logger.game('Tic Tac Toe game started', { gameId, userId: interaction.user.id });
  }

  /**
   * Create Tic Tac Toe embed
   * @param {Object} gameState - Game state
   * @returns {EmbedBuilder} Game embed
   */
  createTicTacToeEmbed(gameState) {
    const board = gameState.board;
    const displayBoard = [];

    for (let i = 0; i < 3; i++) {
      const row = [];
      for (let j = 0; j < 3; j++) {
        const cell = board[i * 3 + j];
        row.push(cell || '⬜');
      }
      displayBoard.push(row.join(''));
    }

    const winner = this.checkTicTacToeWinner(board);
    let description = `**Current Board:**\n${displayBoard.join('\n')}\n\n`;

    if (winner) {
      if (winner === 'tie') {
        description += '**It\'s a tie! 🤝**';
      } else {
        description += `**${winner} wins! 🎉**`;
      }
    } else {
      description += `**Your turn (${gameState.currentPlayer})**`;
    }

    return utils.createEmbed({
      title: '⭕ Tic Tac Toe',
      description,
      color: config.EMBED_COLOR,
      footer: { text: 'Click a button to make your move!' }
    });
  }

  /**
   * Create Tic Tac Toe buttons
   * @param {Object} gameState - Game state
   * @returns {Array<ActionRowBuilder>} Button components
   */
  createTicTacToeButtons(gameState) {
    const components = [];
    const board = gameState.board;
    const winner = this.checkTicTacToeWinner(board);

    for (let i = 0; i < 3; i++) {
      const row = new ActionRowBuilder();
      for (let j = 0; j < 3; j++) {
        const index = i * 3 + j;
        const cell = board[index];
        const button = new ButtonBuilder()
          .setCustomId(`ttt_${index}`)
          .setLabel(cell || '⬜')
          .setStyle(cell === 'X' ? ButtonStyle.Success : cell === 'O' ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(cell !== null || winner !== null);

        row.addComponents(button);
      }
      components.push(row);
    }

    // Add control buttons if game is over
    if (winner) {
      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('play_again_tictactoe')
          .setLabel('🔄 Play Again')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('change_game')
          .setLabel('🎮 Change Game')
          .setStyle(ButtonStyle.Secondary)
      );
      components.push(controlRow);
    }

    return components;
  }

  /**
   * Handle Tic Tac Toe move
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleTicTacToeMove(interaction) {
    const gameState = activeGames.get(interaction.user.id);
    if (!gameState || gameState.type !== 'tictactoe') {
      return await interaction.reply({
        content: '❌ No active Tic Tac Toe game found.',
        flags: 64
      });
    }

    const moveIndex = parseInt(interaction.customId.split('_')[1]);

    if (gameState.board[moveIndex] !== null) {
      return await interaction.reply({
        content: '❌ That space is already taken!',
        flags: 64
      });
    }

    // Make player move
    gameState.board[moveIndex] = gameState.currentPlayer;

    // Check for winner
    let winner = this.checkTicTacToeWinner(gameState.board);

    // AI move if no winner
    if (!winner) {
      const aiMove = this.getTicTacToeAIMove(gameState);
      if (aiMove !== -1) {
        gameState.board[aiMove] = gameState.aiPlayer;
        winner = this.checkTicTacToeWinner(gameState.board);
      }
    }

    // Check for tie
    if (!winner && gameState.board.every(cell => cell !== null)) {
      winner = 'tie';
    }

    // Update game state
    if (winner) {
      gameState.winner = winner;
      gameState.endedAt = Date.now();

      // Log game result
      const result = winner === 'tie' ? 'tie' : (winner === gameState.currentPlayer ? 'win' : 'lose');
      await this.endGame(gameState, result);
    }

    const embed = this.createTicTacToeEmbed(gameState);
    const components = this.createTicTacToeButtons(gameState);

    await interaction.update({
      embeds: [embed],
      components: components
    });
  }

  /**
   * Check Tic Tac Toe winner
   * @param {Array} board - Game board
   * @returns {string|null} Winner ('X', 'O', 'tie') or null
   */
  checkTicTacToeWinner(board) {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
      [0, 4, 8], [2, 4, 6] // diagonals
    ];

    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }

    if (board.every(cell => cell !== null)) {
      return 'tie';
    }

    return null;
  }

  /**
   * Get AI move for Tic Tac Toe using minimax
   * @param {Object} gameState - Game state
   * @returns {number} Move index
   */
  getTicTacToeAIMove(gameState) {
    const board = [...gameState.board];
    const difficulty = gameState.difficulty;

    if (difficulty === 'easy') {
      // Random move
      const availableMoves = board.map((cell, index) => cell === null ? index : null).filter(index => index !== null);
      return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }

    if (difficulty === 'normal') {
      // 70% optimal, 30% random
      if (Math.random() < 0.3) {
        const availableMoves = board.map((cell, index) => cell === null ? index : null).filter(index => index !== null);
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
      }
    }

    // Hard: Use minimax
    return this.minimax(board, gameState.aiPlayer, gameState.currentPlayer, gameState.aiPlayer).index;
  }

  /**
   * Minimax algorithm for Tic Tac Toe
   * @param {Array} board - Game board
   * @param {string} player - Current player
   * @param {string} opponent - Opponent player
   * @param {string} aiPlayer - AI player symbol
   * @returns {Object} Best move and score
   */
  minimax(board, player, opponent, aiPlayer) {
    const availableMoves = board.map((cell, index) => cell === null ? index : null).filter(index => index !== null);

    // Check terminal states
    const winner = this.checkTicTacToeWinner(board);
    if (winner === player) return { score: 10 };
    if (winner === opponent) return { score: -10 };
    if (winner === 'tie') return { score: 0 };

    const moves = [];

    for (const move of availableMoves) {
      const newBoard = [...board];
      newBoard[move] = player;

      const result = this.minimax(newBoard, opponent, player, aiPlayer);
      moves.push({
        index: move,
        score: result.score
      });
    }

    // Choose best move
    let bestMove;
    if (player === aiPlayer) {
      let bestScore = -10000;
      for (const move of moves) {
        if (move.score > bestScore) {
          bestScore = move.score;
          bestMove = move;
        }
      }
    } else {
      let bestScore = 10000;
      for (const move of moves) {
        if (move.score < bestScore) {
          bestScore = move.score;
          bestMove = move;
        }
      }
    }

    return bestMove;
  }

  /**
   * Start Math Challenge game
   * @param {Interaction} interaction - Discord interaction
   */
  async startMathGame(interaction) {
    const difficulties = Object.keys(config.GAMES.MATH.DIFFICULTIES);
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

    const gameId = `math_${interaction.user.id}_${Date.now()}`;
    const gameState = {
      id: gameId,
      type: 'math',
      userId: interaction.user.id,
      difficulty,
      question: this.generateMathQuestion(difficulty),
      answer: null,
      attempts: 0,
      maxAttempts: 1,
      startedAt: Date.now(),
      timeout: setTimeout(() => this.endGameByTimeout(gameId), config.MATH_TIMEOUT)
    };

    gameState.answer = this.calculateMathAnswer(gameState.question);
    activeGames.set(interaction.user.id, gameState);

    const embed = utils.createEmbed({
      title: '🧮 Math Challenge',
      description: `**Difficulty:** ${difficulty.toUpperCase()}\n\n**Question:** ${gameState.question}\n\n**Time Limit:** ${config.MATH_TIMEOUT / 1000} seconds\n\nReply with your answer!`,
      color: config.EMBED_COLOR,
      footer: { text: 'Type your answer in the chat!' }
    });

    await interaction.reply({ embeds: [embed] });

    await Analytics.logEvent('game_started', 1, { type: 'math', difficulty });
    logger.game('Math game started', { gameId, userId: interaction.user.id, difficulty });
  }

  /**
   * Generate math question
   * @param {string} difficulty - Difficulty level
   * @returns {string} Math question
   */
  generateMathQuestion(difficulty) {
    const diffConfig = config.GAMES.MATH.DIFFICULTIES[difficulty];
    const range = diffConfig.range;

    const operations = ['+', '-', '*'];
    if (diffConfig.includeMultiplication) operations.push('*');

    const operation = operations[Math.floor(Math.random() * operations.length)];
    const num1 = Math.floor(Math.random() * range) + 1;
    const num2 = Math.floor(Math.random() * range) + 1;

    return `${num1} ${operation} ${num2}`;
  }

  /**
   * Calculate math answer
   * @param {string} question - Math question
   * @returns {number} Answer
   */
  calculateMathAnswer(question) {
    return eval(question);
  }

  /**
   * Start Number Guessing game
   * @param {Interaction} interaction - Discord interaction
   */
  async startNumberGuess(interaction) {
    const gameId = `guess_${interaction.user.id}_${Date.now()}`;
    const gameState = {
      id: gameId,
      type: 'guess',
      userId: interaction.user.id,
      number: Math.floor(Math.random() * (config.GAMES.GUESSING.RANGE.max - config.GAMES.GUESSING.RANGE.min + 1)) + config.GAMES.GUESSING.RANGE.min,
      attempts: 0,
      maxAttempts: config.GAMES.GUESSING.MAX_ATTEMPTS,
      guesses: [],
      startedAt: Date.now(),
      timeout: setTimeout(() => this.endGameByTimeout(gameId), config.GAME_TIMEOUT)
    };

    activeGames.set(interaction.user.id, gameState);

    const embed = utils.createEmbed({
      title: '🎲 Number Guessing Game',
      description: `I'm thinking of a number between ${config.GAMES.GUESSING.RANGE.min} and ${config.GAMES.GUESSING.RANGE.max}.\n\n**Attempts remaining:** ${gameState.maxAttempts}\n\nGuess a number!`,
      color: config.EMBED_COLOR,
      footer: { text: 'Type your guess in the chat!' }
    });

    await interaction.reply({ embeds: [embed] });

    await Analytics.logEvent('game_started', 1, { type: 'guess' });
    logger.game('Number guessing game started', { gameId, userId: interaction.user.id });
  }

  /**
   * Start Rock Paper Scissors game
   * @param {Interaction} interaction - Discord interaction
   */
  async startRockPaperScissors(interaction) {
    const gameId = `rps_${interaction.user.id}_${Date.now()}`;
    const gameState = {
      id: gameId,
      type: 'rps',
      userId: interaction.user.id,
      startedAt: Date.now()
    };

    activeGames.set(interaction.user.id, gameState);

    const embed = utils.createEmbed({
      title: '✂️ Rock Paper Scissors',
      description: 'Choose your move!',
      color: config.EMBED_COLOR
    });

    const buttons = config.GAMES.ROCKPAPERSCISSORS.CHOICES.map(choice => {
      const emoji = { rock: '🪨', paper: '📄', scissors: '✂️' }[choice];
      return new ButtonBuilder()
        .setCustomId(`rps_${choice}`)
        .setLabel(`${emoji} ${choice.charAt(0).toUpperCase() + choice.slice(1)}`)
        .setStyle(ButtonStyle.Primary);
    });

    const row = new ActionRowBuilder().addComponents(buttons);

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });

    await Analytics.logEvent('game_started', 1, { type: 'rps' });
    logger.game('Rock Paper Scissors game started', { gameId, userId: interaction.user.id });
  }

  /**
   * Handle Rock Paper Scissors move
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleRockPaperScissors(interaction) {
    const gameState = activeGames.get(interaction.user.id);
    if (!gameState || gameState.type !== 'rps') {
      return await interaction.reply({
        content: '❌ No active Rock Paper Scissors game found.',
        flags: 64
      });
    }

    const userChoice = interaction.customId.split('_')[1];
    const aiChoice = config.GAMES.ROCKPAPERSCISSORS.CHOICES[Math.floor(Math.random() * config.GAMES.ROCKPAPERSCISSORS.CHOICES.length)];

    const result = this.getRPSResult(userChoice, aiChoice);
    const resultEmoji = { win: '🎉', lose: '😢', tie: '🤝' }[result];

    const embed = utils.createEmbed({
      title: '✂️ Rock Paper Scissors - Result',
      description: `**Your choice:** ${this.formatRPSChoice(userChoice)}\n**My choice:** ${this.formatRPSChoice(aiChoice)}\n\n**Result:** ${result.toUpperCase()} ${resultEmoji}`,
      color: result === 'win' ? config.SUCCESS_COLOR : result === 'lose' ? config.ERROR_COLOR : config.WARNING_COLOR
    });

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_again_rps')
        .setLabel('🔄 Play Again')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('change_game')
        .setLabel('🎮 Change Game')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({
      embeds: [embed],
      components: [controlRow]
    });

    // End game
    gameState.result = result;
    gameState.endedAt = Date.now();
    await this.endGame(gameState, result);

    activeGames.delete(interaction.user.id);
  }

  /**
   * Get RPS result
   * @param {string} userChoice - User's choice
   * @param {string} aiChoice - AI's choice
   * @returns {string} Result ('win', 'lose', 'tie')
   */
  getRPSResult(userChoice, aiChoice) {
    if (userChoice === aiChoice) return 'tie';

    const winConditions = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper'
    };

    return winConditions[userChoice] === aiChoice ? 'win' : 'lose';
  }

  /**
   * Format RPS choice
   * @param {string} choice - Choice
   * @returns {string} Formatted choice
   */
  formatRPSChoice(choice) {
    const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
    return `${emojis[choice]} ${choice.charAt(0).toUpperCase() + choice.slice(1)}`;
  }

  /**
   * Start Trivia game
   * @param {Interaction} interaction - Discord interaction
   */
  async startTrivia(interaction) {
    const questions = this.getTriviaQuestions();
    const question = questions[Math.floor(Math.random() * questions.length)];

    const gameId = `trivia_${interaction.user.id}_${Date.now()}`;
    const gameState = {
      id: gameId,
      type: 'trivia',
      userId: interaction.user.id,
      question: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      attempts: 0,
      maxAttempts: 1,
      startedAt: Date.now(),
      timeout: setTimeout(() => this.endGameByTimeout(gameId), config.GAMES.TRIVIA.TIME_PER_QUESTION)
    };

    activeGames.set(interaction.user.id, gameState);

    const embed = utils.createEmbed({
      title: '🧠 Trivia Quiz',
      description: `**Question:** ${question.question}\n\n${question.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}\n\n**Time Limit:** ${config.GAMES.TRIVIA.TIME_PER_QUESTION / 1000} seconds`,
      color: config.EMBED_COLOR,
      footer: { text: 'Click a button to answer!' }
    });

    const buttons = question.options.map((option, index) => {
      return new ButtonBuilder()
        .setCustomId(`trivia_${index}`)
        .setLabel(`${index + 1}`)
        .setStyle(ButtonStyle.Primary);
    });

    const row = new ActionRowBuilder().addComponents(buttons);

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });

    await Analytics.logEvent('game_started', 1, { type: 'trivia' });
    logger.game('Trivia game started', { gameId, userId: interaction.user.id });
  }

  /**
   * Get trivia questions
   * @returns {Array} Trivia questions
   */
  getTriviaQuestions() {
    return [
      {
        question: 'What is the capital of France?',
        options: ['London', 'Berlin', 'Paris', 'Madrid'],
        correctAnswer: 2
      },
      {
        question: 'Which planet is known as the Red Planet?',
        options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
        correctAnswer: 1
      },
      {
        question: 'What is 2 + 2 × 3?',
        options: ['12', '8', '10', '6'],
        correctAnswer: 1
      },
      {
        question: 'Who painted the Mona Lisa?',
        options: ['Van Gogh', 'Da Vinci', 'Picasso', 'Rembrandt'],
        correctAnswer: 1
      },
      {
        question: 'What is the largest ocean on Earth?',
        options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
        correctAnswer: 3
      }
    ];
  }

  /**
   * Handle Trivia answer
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleTrivia(interaction) {
    const gameState = activeGames.get(interaction.user.id);
    if (!gameState || gameState.type !== 'trivia') {
      return await interaction.reply({
        content: '❌ No active Trivia game found.',
        flags: 64
      });
    }

    const answerIndex = parseInt(interaction.customId.split('_')[1]);
    const isCorrect = answerIndex === gameState.correctAnswer;

    const result = isCorrect ? 'win' : 'lose';
    const resultEmoji = isCorrect ? '✅' : '❌';

    const embed = utils.createEmbed({
      title: '🧠 Trivia Quiz - Result',
      description: `**Your answer:** ${gameState.options[answerIndex]}\n**Correct answer:** ${gameState.options[gameState.correctAnswer]}\n\n**Result:** ${isCorrect ? 'Correct' : 'Incorrect'} ${resultEmoji}`,
      color: isCorrect ? config.SUCCESS_COLOR : config.ERROR_COLOR
    });

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_again_trivia')
        .setLabel('🔄 Play Again')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('change_game')
        .setLabel('🎮 Change Game')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({
      embeds: [embed],
      components: [controlRow]
    });

    // End game
    gameState.result = result;
    gameState.endedAt = Date.now();
    await this.endGame(gameState, result);

    activeGames.delete(interaction.user.id);
  }

  /**
   * Start Hangman game
   * @param {Interaction} interaction - Discord interaction
   */
  async startHangman(interaction) {
    const words = ['javascript', 'python', 'discord', 'computer', 'programming', 'algorithm', 'database', 'network', 'security', 'internet'];
    const word = words[Math.floor(Math.random() * words.length)];

    const gameId = `hangman_${interaction.user.id}_${Date.now()}`;
    const gameState = {
      id: gameId,
      type: 'hangman',
      userId: interaction.user.id,
      word: word,
      guessed: [],
      wrongGuesses: 0,
      maxWrongGuesses: config.GAMES.HANGMAN.MAX_WRONG_GUESSES,
      display: '_'.repeat(word.length),
      startedAt: Date.now(),
      timeout: setTimeout(() => this.endGameByTimeout(gameId), config.GAME_TIMEOUT)
    };

    activeGames.set(interaction.user.id, gameState);

    const embed = utils.createEmbed({
      title: '🎯 Hangman',
      description: `**Word:** ${gameState.display.split('').join(' ')}\n**Wrong guesses:** ${gameState.wrongGuesses}/${gameState.maxWrongGuesses}\n**Guessed letters:** ${gameState.guessed.length > 0 ? gameState.guessed.join(', ') : 'None'}`,
      color: config.EMBED_COLOR,
      footer: { text: 'Click the button to guess a letter!' }
    });

    const button = new ButtonBuilder()
      .setCustomId('hangman_guess')
      .setLabel('Guess Letter')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row] });

    await Analytics.logEvent('game_started', 1, { type: 'hangman' });
    logger.game('Hangman game started', { gameId, userId: interaction.user.id, wordLength: word.length });
  }

  /**
   * Handle Hangman guess modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleHangmanGuessModal(interaction) {
    const letter = interaction.fields.getTextInputValue('letter').toLowerCase();

    if (!/^[a-z]$/.test(letter)) {
      return await interaction.reply({
        content: '❌ Please enter a single letter.',
        flags: 64
      });
    }

    const gameState = activeGames.get(interaction.user.id);
    if (!gameState || gameState.type !== 'hangman') {
      return await interaction.reply({
        content: '❌ No active Hangman game found.',
        flags: 64
      });
    }

    if (gameState.guessed.includes(letter)) {
      return await interaction.reply({
        content: '❌ You already guessed that letter!',
        flags: 64
      });
    }

    gameState.guessed.push(letter);

    if (gameState.word.includes(letter)) {
      // Correct guess
      let newDisplay = '';
      for (let i = 0; i < gameState.word.length; i++) {
        if (gameState.guessed.includes(gameState.word[i])) {
          newDisplay += gameState.word[i];
        } else {
          newDisplay += '_';
        }
      }
      gameState.display = newDisplay;
    } else {
      // Wrong guess
      gameState.wrongGuesses++;
    }

    // Check win/lose conditions
    let gameEnded = false;
    let result = null;

    if (gameState.display === gameState.word) {
      gameEnded = true;
      result = 'win';
    } else if (gameState.wrongGuesses >= gameState.maxWrongGuesses) {
      gameEnded = true;
      result = 'lose';
    }

    const embed = utils.createEmbed({
      title: '🎯 Hangman',
      description: `**Word:** ${gameState.display.split('').join(' ')}\n**Wrong guesses:** ${gameState.wrongGuesses}/${gameState.maxWrongGuesses}\n**Guessed letters:** ${gameState.guessed.join(', ')}\n\n${gameEnded ? `**Result:** ${result === 'win' ? 'You won! 🎉' : `You lost! The word was: ${gameState.word}`}` : ''}`,
      color: gameEnded ? (result === 'win' ? config.SUCCESS_COLOR : config.ERROR_COLOR) : config.EMBED_COLOR
    });

    if (gameEnded) {
      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('play_again_hangman')
          .setLabel('🔄 Play Again')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('change_game')
          .setLabel('🎮 Change Game')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.update({
        embeds: [embed],
        components: [controlRow]
      });

      // End game
      gameState.result = result;
      gameState.endedAt = Date.now();
      await this.endGame(gameState, result);

      activeGames.delete(interaction.user.id);
    } else {
      const button = new ButtonBuilder()
        .setCustomId('hangman_guess')
        .setLabel('Guess Letter')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.update({ embeds: [embed], components: [row] });
    }
  }

  /**
   * Handle Hangman guess button
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleHangman(interaction) {
    if (interaction.customId === 'hangman_guess') {
      const modal = new ModalBuilder()
        .setCustomId('hangman_guess_modal')
        .setTitle('Guess a Letter')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('letter')
              .setLabel('Enter a single letter (a-z)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(1)
              .setMinLength(1)
          )
        );

      await interaction.showModal(modal);
    }
  }

  /**
   * Handle play again button
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handlePlayAgain(interaction) {
    const gameType = interaction.customId.split('_')[2];
    await this.handleGameSelect({
      values: [gameType],
      reply: interaction.reply.bind(interaction),
      user: interaction.user
    });
  }

  /**
   * Handle change game button
   * @param {ButtonInteraction} interaction - Button interaction
   */
  async handleChangeGame(interaction) {
    const embed = utils.createEmbed({
      title: '🎮 Choose a Game',
      description: 'Select a mini-game to play while waiting!',
      color: config.EMBED_COLOR
    });

    const gameOptions = [
      { label: '⭕ Tic Tac Toe', value: 'tictactoe' },
      { label: '🧮 Math Challenge', value: 'math' },
      { label: '🎲 Number Guessing', value: 'guess' },
      { label: '✂️ Rock Paper Scissors', value: 'rps' },
      { label: '🧠 Trivia Quiz', value: 'trivia' },
      { label: '🎯 Hangman', value: 'hangman' }
    ];

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('game_select')
      .setPlaceholder('Choose a game...')
      .addOptions(gameOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.update({
      embeds: [embed],
      components: [row]
    });
  }

  /**
   * Handle difficulty select
   * @param {StringSelectMenuInteraction} interaction - Select menu interaction
   */
  async handleDifficultySelect(interaction) {
    // Implementation for difficulty selection if needed
    await interaction.reply({
      content: 'Difficulty selection not implemented yet.',
      flags: 64
    });
  }

  /**
   * Handle math difficulty modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleMathDifficultyModal(interaction) {
    // Implementation for math difficulty modal if needed
    await interaction.reply({
      content: 'Math difficulty modal not implemented yet.',
      flags: 64
    });
  }

  /**
   * Handle trivia answer modal
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   */
  async handleTriviaAnswerModal(interaction) {
    // Implementation for trivia answer modal if needed
    await interaction.reply({
      content: 'Trivia answer modal not implemented yet.',
      flags: 64
    });
  }

  /**
   * End game and save results
   * @param {Object} gameState - Game state
   * @param {string} result - Game result ('win', 'lose', 'tie')
   */
  async endGame(gameState, result) {
    // Clear timeout
    if (gameState.timeout) {
      clearTimeout(gameState.timeout);
    }

    // Update user stats
    await User.updateStats(gameState.userId, { gamesPlayed: 1 });

    // Log analytics
    await Analytics.logEvent('game_ended', 1, {
      type: gameState.type,
      result,
      duration: Date.now() - gameState.startedAt
    });

    logger.game(`Game ended: ${result}`, {
      gameId: gameState.id,
      userId: gameState.userId,
      type: gameState.type,
      result,
      duration: Date.now() - gameState.startedAt
    });
  }

  /**
   * End game by timeout
   * @param {string} gameId - Game ID
   */
  async endGameByTimeout(gameId) {
    // Find game by ID
    for (const [userId, gameState] of activeGames.entries()) {
      if (gameState.id === gameId) {
        await this.endGame(gameState, 'timeout');
        activeGames.delete(userId);

        // Send timeout message
        try {
          const user = await this.client.users.fetch(userId);
          await user.send('⏰ Your game timed out! Try again when you\'re ready.');
        } catch (error) {
          logger.logError(error, { context: 'Sending timeout message', userId });
        }
        break;
      }
    }
  }

  /**
   * Clean up rate limits periodically
   */
  cleanupRateLimits() {
    utils.cleanupRateLimits(rateLimits);
  }

  /**
   * Get active games count
   * @returns {number} Number of active games
   */
  getActiveGamesCount() {
    return activeGames.size;
  }

  /**
   * Handle message events for text-based games (math, guessing)
   * @param {Message} message - Discord message
   */
  async handleMessage(message) {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;

    const gameState = activeGames.get(message.author.id);
    if (!gameState) return; // No active game

    try {
      if (gameState.type === 'math') {
        await this.handleMathAnswer(message, gameState);
      } else if (gameState.type === 'guess') {
        await this.handleGuess(message, gameState);
      } else {
        // For other games, ignore or handle if needed
        return;
      }
    } catch (error) {
      logger.logError(error, { context: 'Game message handling', userId: message.author.id, gameType: gameState.type });
      await message.reply('❌ An error occurred while processing your game response. Please start a new game.');
    }
  }

  /**
   * Handle math game answer
   * @param {Message} message - Discord message
   * @param {Object} gameState - Game state
   */
  async handleMathAnswer(message, gameState) {
    const userAnswer = parseInt(message.content.trim());
    if (isNaN(userAnswer)) {
      return await message.reply('❌ Please enter a valid number!');
    }

    gameState.attempts++;
    const isCorrect = userAnswer === gameState.answer;

    if (isCorrect) {
      // Win
      gameState.result = 'win';
      gameState.endedAt = Date.now();
      await this.endGame(gameState, 'win');

      const embed = utils.createEmbed({
        title: '🧮 Math Challenge - Correct!',
        description: `**Your answer:** ${userAnswer}\n**Correct!** 🎉\n**Attempts:** ${gameState.attempts}`,
        color: config.SUCCESS_COLOR
      });

      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('play_again_math')
          .setLabel('🔄 Play Again')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('change_game')
          .setLabel('🎮 Change Game')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.reply({ embeds: [embed], components: [controlRow] });
      activeGames.delete(message.author.id);
    } else {
      // Wrong answer
      if (gameState.attempts >= gameState.maxAttempts) {
        gameState.result = 'lose';
        gameState.endedAt = Date.now();
        await this.endGame(gameState, 'lose');

        const embed = utils.createEmbed({
          title: '🧮 Math Challenge - Game Over',
          description: `**Your answer:** ${userAnswer}\n**Correct answer:** ${gameState.answer}\n**Attempts used:** ${gameState.attempts}\n**Better luck next time!** 😔`,
          color: config.ERROR_COLOR
        });

        const controlRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('play_again_math')
            .setLabel('🔄 Play Again')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('change_game')
            .setLabel('🎮 Change Game')
            .setStyle(ButtonStyle.Secondary)
        );

        await message.reply({ embeds: [embed], components: [controlRow] });
        activeGames.delete(message.author.id);
      } else {
        await message.reply(`❌ Wrong! Try again. Attempts left: ${gameState.maxAttempts - gameState.attempts}`);
      }
    }
  }

  /**
   * Handle number guessing
   * @param {Message} message - Discord message
   * @param {Object} gameState - Game state
   */
  async handleGuess(message, gameState) {
    const guess = parseInt(message.content.trim());
    if (isNaN(guess) || guess < config.GAMES.GUESSING.RANGE.min || guess > config.GAMES.GUESSING.RANGE.max) {
      return await message.reply(`❌ Please enter a valid number between ${config.GAMES.GUESSING.RANGE.min} and ${config.GAMES.GUESSING.RANGE.max}!`);
    }

    gameState.attempts++;
    gameState.guesses.push(guess);

    if (guess === gameState.number) {
      // Win
      gameState.result = 'win';
      gameState.endedAt = Date.now();
      await this.endGame(gameState, 'win');

      const embed = utils.createEmbed({
        title: '🎲 Number Guessing - Correct!',
        description: `**Your guess:** ${guess}\n**The number was:** ${gameState.number}\n**Attempts:** ${gameState.attempts}\n**Congratulations!** 🎉`,
        color: config.SUCCESS_COLOR
      });

      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('play_again_guess')
          .setLabel('🔄 Play Again')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('change_game')
          .setLabel('🎮 Change Game')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.reply({ embeds: [embed], components: [controlRow] });
      activeGames.delete(message.author.id);
    } else {
      const hint = guess < gameState.number ? 'higher' : 'lower';
      const attemptsLeft = gameState.maxAttempts - gameState.attempts;

      if (attemptsLeft <= 0) {
        // Lose
        gameState.result = 'lose';
        gameState.endedAt = Date.now();
        await this.endGame(gameState, 'lose');

        const embed = utils.createEmbed({
          title: '🎲 Number Guessing - Game Over',
          description: `**Your last guess:** ${guess}\n**The number was:** ${gameState.number}\n**Attempts used:** ${gameState.attempts}\n**Too bad!** 😔`,
          color: config.ERROR_COLOR
        });

        const controlRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('play_again_guess')
            .setLabel('🔄 Play Again')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('change_game')
            .setLabel('🎮 Change Game')
            .setStyle(ButtonStyle.Secondary)
        );

        await message.reply({ embeds: [embed], components: [controlRow] });
        activeGames.delete(message.author.id);
      } else {
        await message.reply(`❌ ${guess} is too ${hint}! Attempts left: ${attemptsLeft}`);
      }
    }
  }

}

module.exports = GameHandler;
