// Database setup and connection management for the Discord Ticket Bot

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class Database {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.ensureDatabaseDirectory();
  }

  /**
   * Ensure the database directory exists
   */
  ensureDatabaseDirectory() {
    const dbDir = path.dirname(config.DATABASE_PATH);
    fs.ensureDirSync(dbDir);
  }

  /**
   * Connect to the SQLite database
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(config.DATABASE_PATH, (err) => {
        if (err) {
          console.error('Database connection error:', err.message);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.isConnected = true;
          this.initializeTables().then(resolve).catch(reject);
        }
      });
    });
  }

  /**
   * Initialize database tables
   * @returns {Promise<void>}
   */
  async initializeTables() {
    const tables = [
      // Tickets table
      `CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT UNIQUE NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        claimed_by TEXT,
        claimed_at DATETIME,
        closed_by TEXT,
        closed_at DATETIME,
        close_reason TEXT,
        transcript_path TEXT,
        data TEXT
      )`,

      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        discriminator TEXT,
        tickets_created INTEGER DEFAULT 0,
        tickets_closed INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        rating_average REAL DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Games table
      `CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        data TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        result TEXT
      )`,

      // Ratings table
      `CREATE TABLE IF NOT EXISTS ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        staff_id TEXT,
        rating INTEGER NOT NULL,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets (ticket_id)
      )`,

      // Analytics table
      `CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        metric TEXT NOT NULL,
        value INTEGER DEFAULT 0,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, metric)
      )`,

      // Settings table for bot configuration
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Rate limits table
      `CREATE TABLE IF NOT EXISTS rate_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identifier TEXT NOT NULL,
        action TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        reset_time DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(identifier, action)
      )`,

      // File uploads table
      `CREATE TABLE IF NOT EXISTS file_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        path TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets (ticket_id)
      )`,

      // Custom fields table
      `CREATE TABLE IF NOT EXISTS custom_fields (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_type TEXT NOT NULL,
        field_name TEXT NOT NULL,
        field_type TEXT NOT NULL,
        required BOOLEAN DEFAULT FALSE,
        options TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_type, field_name)
      )`
    ];

    for (const sql of tables) {
      await this.run(sql);
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)',
      'CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_games_status ON games(status)',
      'CREATE INDEX IF NOT EXISTS idx_ratings_ticket_id ON ratings(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date)',
      'CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier)',
      'CREATE INDEX IF NOT EXISTS idx_file_uploads_ticket_id ON file_uploads(ticket_id)'
    ];

    for (const sql of indexes) {
      await this.run(sql);
    }
  }

  /**
   * Run a SQL query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise}
   */
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Get a single row from query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>}
   */
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get all rows from query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>}
   */
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Execute multiple SQL statements in a transaction
   * @param {Array<string>} statements - SQL statements
   * @returns {Promise}
   */
  async transaction(statements) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        const promises = statements.map(sql => this.run(sql));

        Promise.all(promises)
          .then(() => {
            this.db.run('COMMIT');
            resolve();
          })
          .catch((err) => {
            this.db.run('ROLLBACK');
            reject(err);
          });
      });
    });
  }

  /**
   * Backup the database
   * @param {string} backupPath - Path for backup file
   * @returns {Promise<void>}
   */
  async backup(backupPath) {
    return new Promise((resolve, reject) => {
      const backup = this.db.backup(backupPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db && this.isConnected) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.isConnected = false;
            console.log('Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const stats = {};

    // Table counts
    const tables = ['tickets', 'users', 'games', 'ratings', 'analytics', 'file_uploads'];
    for (const table of tables) {
      const result = await this.get(`SELECT COUNT(*) as count FROM ${table}`);
      stats[table] = result.count;
    }

    // Database file size
    const dbStats = fs.statSync(config.DATABASE_PATH);
    stats.fileSize = dbStats.size;

    return stats;
  }

  /**
   * Clean up old data based on retention policies
   * @returns {Promise<void>}
   */
  async cleanup() {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - config.ANALYTICS_RETENTION_DAYS);

    await this.run('DELETE FROM analytics WHERE date < ?', [retentionDate.toISOString().split('T')[0]]);
    await this.run('DELETE FROM rate_limits WHERE reset_time < datetime("now")');

    // Vacuum database to reclaim space
    await this.run('VACUUM');
  }
}

module.exports = new Database();
