# Contributing to Discord Ticket Bot

Thank you for your interest in contributing to the Discord Ticket Bot! This document provides guidelines and information for contributors.

## Code of Conduct

This project follows a code of conduct to ensure a welcoming environment for all contributors.

## How to Contribute

### Reporting Bugs

- Use the GitHub issue tracker
- Describe the bug clearly with steps to reproduce
- Include your environment (Node.js version, OS, etc.)
- Attach relevant log files if available

### Suggesting Features

- Use the GitHub issue tracker with the "enhancement" label
- Describe the feature and its use case
- Explain why it would be beneficial

### Contributing Code

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test your changes**
   ```bash
   npm test
   npm run dev
   ```
5. **Commit your changes**
   ```bash
   git commit -m "Add: brief description of your changes"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Create a Pull Request**

## Development Setup

1. Clone your fork
2. Run setup: `npm run setup`
3. Configure your `.env` file
4. Start development: `npm run dev`

## Coding Standards

### JavaScript Style
- Use ES6+ features
- Use `const` and `let` instead of `var`
- Use arrow functions where appropriate
- Use async/await for asynchronous code
- Use meaningful variable and function names

### Code Structure
- Keep functions small and focused
- Use JSDoc comments for complex functions
- Follow the existing file structure
- Add error handling where appropriate

### Commits
- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, Remove, etc.)
- Keep commits focused on a single change

## Testing

- Test your changes thoroughly
- Test edge cases and error conditions
- Ensure existing functionality still works
- Add tests for new features when possible

## Documentation

- Update README.md for significant changes
- Add JSDoc comments for new functions
- Update configuration examples if needed

## Pull Request Process

1. Ensure your code follows the coding standards
2. Update documentation if needed
3. Test your changes
4. Create a pull request with a clear description
5. Wait for review and address feedback

## Areas for Contribution

- Bug fixes
- New features
- Documentation improvements
- Performance optimizations
- Code refactoring
- New games or handlers

## Questions?

If you have questions about contributing, feel free to:
- Create an issue on GitHub
- Join our Discord server (if available)
- Contact the maintainers

Thank you for contributing to make this project better!