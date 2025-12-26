# Discord Ticket Bot Template

A comprehensive, open-source Discord ticket support bot with mini-games, analytics, and modular architecture. Perfect for communities needing organized support systems.

## Features

- 🎫 **Advanced Ticket System**: Create, manage, and close support tickets with priorities
- 🎮 **Mini-Games**: Integrated games (Tic-Tac-Toe, Math Challenges, Number Guessing, Rock-Paper-Scissors, Trivia, Hangman)
- 📊 **Analytics Dashboard**: Track ticket metrics, user engagement, and performance
- 🔧 **Modular Architecture**: Easy to extend and customize
- 🚀 **Auto-Setup**: Automatic dependency installation and database setup
- 📝 **Comprehensive Logging**: Winston-based logging with rotation
- ⚡ **Rate Limiting**: Prevent spam and abuse
- 🎨 **Customizable**: Configure colors, emojis, and behavior

## Prerequisites

- Node.js 18.0.0 or higher
- A Discord Bot Token
- Discord Server with appropriate permissions

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/discord-ticket-bot.git
   cd discord-ticket-bot
   ```

2. **Run the setup script**
   ```bash
   npm run setup
   ```
   This will:
   - Create your `.env` file from `.env.example`
   - Install dependencies
   - Create necessary directories

3. **Configure your bot**
   - Edit the `.env` file with your Discord bot token and server details

4. **Set up your Discord server**
   - Create the required channels and roles
   - Note down their IDs for the `.env` file

5. **Run the bot**
   ```bash
   npm start
   ```

## Configuration

### Environment Variables (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Your Discord bot token | Yes |
| `GUILD_ID` | Your Discord server ID | Yes |
| `TICKET_CATEGORY_ID` | Category for ticket channels | Yes |
| `TICKET_CHANNEL_ID` | Channel for creating tickets | Yes |
| `OPEN_LOG_CHANNEL_ID` | Channel for ticket open logs | Yes |
| `CLOSE_LOG_CHANNEL_ID` | Channel for ticket close logs | Yes |
| `STAR_LOG_CHANNEL_ID` | Channel for ticket ratings | No |
| `STAFF_ROLES` | Comma-separated staff role IDs | Yes |

### Bot Permissions

Your bot needs the following permissions in your Discord server:
- Read Messages
- Send Messages
- Manage Channels
- Manage Messages
- Embed Links
- Use Slash Commands
- Read Message History

## Usage

### For Users
- Use `/ticket create` to create a support ticket
- Play games while waiting for support
- Rate your support experience with star reactions

### For Staff
- Use ticket management commands to handle support requests
- View analytics with admin commands
- Configure bot settings

## Project Structure

```
├── config.js          # Configuration constants
├── index.js           # Main bot file
├── logger.js          # Logging setup
├── utils.js           # Utility functions
├── handlers/          # Event handlers
│   ├── interactionHandler.js
│   ├── ticketHandler.js
│   ├── gameHandler.js
│   └── adminHandler.js
├── models/            # Data models
│   ├── database.js
│   ├── ticket.js
│   ├── user.js
│   └── analytics.js
├── games/             # Game implementations
│   ├── hangman.js
│   ├── rockPaperScissors.js
│   └── trivia.js
├── scripts/           # Utility scripts
├── data/              # Database files
└── logs/              # Log files
```

## Customization

### Adding New Games
1. Create a new file in the `games/` directory
2. Implement the game logic
3. Register it in `gameHandler.js`

### Adding New Commands
1. Add command definitions to the appropriate handler
2. Implement the command logic
3. Update permissions if needed

### Styling
- Modify colors in `config.js`
- Update emojis to match your server's style
- Customize embed messages in the handlers

## Development

### Scripts
- `npm start` - Start the bot
- `npm run dev` - Start with nodemon for development
- `npm test` - Run tests
- `npm run setup` - Install dependencies and create directories

### Database
The bot uses SQLite for data storage. Database files are created automatically in the `data/` directory.

### Logging
Logs are stored in the `logs/` directory with daily rotation.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to get started.

### Quick Contribution Steps
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Create an issue on GitHub
- Check the logs for error details
- Ensure your configuration is correct

## Disclaimer

This bot template is provided as-is. Make sure to test thoroughly in a development environment before deploying to production.