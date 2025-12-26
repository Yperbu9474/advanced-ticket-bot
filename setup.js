#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Discord Ticket Bot Setup');
console.log('===========================\n');

// Check if .env already exists
if (fs.existsSync('.env')) {
  console.log('⚠️  .env file already exists. Skipping creation.');
  console.log('   If you need to reset, delete .env and run this script again.\n');
} else {
  // Copy .env.example to .env
  if (fs.existsSync('.env.example')) {
    fs.copyFileSync('.env.example', '.env');
    console.log('✅ Created .env file from .env.example');
    console.log('   Please edit .env with your Discord bot credentials.\n');
  } else {
    console.log('❌ .env.example not found. Please create it manually.\n');
  }
}

// Check if package.json exists and install dependencies
if (fs.existsSync('package.json')) {
  console.log('📦 Installing dependencies...');
  try {
    require('child_process').execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed successfully.\n');
  } catch (error) {
    console.log('❌ Failed to install dependencies. Please run "npm install" manually.\n');
  }
} else {
  console.log('❌ package.json not found.\n');
}

// Create necessary directories
const dirs = ['data', 'logs'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created ${dir}/ directory`);
  } else {
    console.log(`⚠️  ${dir}/ directory already exists`);
  }
});

console.log('\n🎉 Setup complete!');
console.log('Next steps:');
console.log('1. Edit .env with your Discord bot token and server IDs');
console.log('2. Run "npm start" to start the bot');
console.log('3. Invite the bot to your server with proper permissions\n');

console.log('📖 For detailed setup instructions, see README.md');