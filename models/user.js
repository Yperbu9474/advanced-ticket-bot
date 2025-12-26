// User data model and operations

const database = require('./database');

class User {
  /**
   * Create or update user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} User data
   */
  static async upsert(userData) {
    const { userId, username, discriminator } = userData;

    await database.run(
      `INSERT INTO users (user_id, username, discriminator, last_seen)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         username = excluded.username,
         discriminator = excluded.discriminator,
         last_seen = CURRENT_TIMESTAMP`,
      [userId, username, discriminator]
    );

    return this.findById(userId);
  }

  /**
   * Find user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User data or null
   */
  static async findById(userId) {
    const row = await database.get(
      'SELECT * FROM users WHERE user_id = ?',
      [userId]
    );

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      discriminator: row.discriminator,
      ticketsCreated: row.tickets_created,
      ticketsClosed: row.tickets_closed,
      gamesPlayed: row.games_played,
      ratingAverage: row.rating_average,
      ratingCount: row.rating_count,
      lastSeen: new Date(row.last_seen),
      createdAt: new Date(row.created_at)
    };
  }

  /**
   * Update user statistics
   * @param {string} userId - User ID
   * @param {Object} stats - Statistics to update
   * @returns {Promise<boolean>} Success status
   */
  static async updateStats(userId, stats) {
    const updates = [];
    const params = [];

    if (stats.ticketsCreated !== undefined) {
      updates.push('tickets_created = tickets_created + ?');
      params.push(stats.ticketsCreated);
    }

    if (stats.ticketsClosed !== undefined) {
      updates.push('tickets_closed = tickets_closed + ?');
      params.push(stats.ticketsClosed);
    }

    if (stats.gamesPlayed !== undefined) {
      updates.push('games_played = games_played + ?');
      params.push(stats.gamesPlayed);
    }

    if (updates.length === 0) return false;

    params.push(userId);
    const result = await database.run(
      `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`,
      params
    );

    return result.changes > 0;
  }

  /**
   * Add rating to user
   * @param {string} userId - User ID
   * @param {number} rating - Rating value (1-5)
   * @returns {Promise<boolean>} Success status
   */
  static async addRating(userId, rating) {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const user = await this.findById(userId);
    if (!user) return false;

    const newCount = user.ratingCount + 1;
    const newAverage = ((user.ratingAverage * user.ratingCount) + rating) / newCount;

    const result = await database.run(
      `UPDATE users SET
       rating_average = ?,
       rating_count = ?
       WHERE user_id = ?`,
      [newAverage, newCount, userId]
    );

    return result.changes > 0;
  }

  /**
   * Get user statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User statistics or null
   */
  static async getStats(userId) {
    const user = await this.findById(userId);
    if (!user) return null;

    // Get recent tickets
    const recentTickets = await database.all(
      `SELECT ticket_id, type, status, created_at
       FROM tickets
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Get game statistics
    const gameStats = await database.get(
      `SELECT
       COUNT(*) as total_games,
       SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
       SUM(CASE WHEN result = 'lose' THEN 1 ELSE 0 END) as losses,
       SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) as ties
       FROM games
       WHERE user_id = ?`,
      [userId]
    );

    return {
      user: user,
      recentTickets: recentTickets.map(ticket => ({
        ticketId: ticket.ticket_id,
        type: ticket.type,
        status: ticket.status,
        createdAt: new Date(ticket.created_at)
      })),
      gameStats: {
        totalGames: gameStats.total_games || 0,
        wins: gameStats.wins || 0,
        losses: gameStats.losses || 0,
        ties: gameStats.ties || 0,
        winRate: gameStats.total_games > 0 ?
          Math.round((gameStats.wins / gameStats.total_games) * 100) : 0
      }
    };
  }

  /**
   * Get top users by various metrics
   * @param {string} metric - Metric to rank by (tickets_created, rating_average, games_played)
   * @param {number} limit - Number of results to return
   * @returns {Promise<Array>} Array of top users
   */
  static async getTopUsers(metric = 'tickets_created', limit = 10) {
    const validMetrics = ['tickets_created', 'rating_average', 'games_played'];
    if (!validMetrics.includes(metric)) {
      throw new Error('Invalid metric');
    }

    const rows = await database.all(
      `SELECT user_id, username, ${metric}
       FROM users
       ORDER BY ${metric} DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      value: row[metric]
    }));
  }

  /**
   * Search users by username
   * @param {string} query - Search query
   * @param {number} limit - Number of results to return
   * @returns {Promise<Array>} Array of matching users
   */
  static async searchByUsername(query, limit = 10) {
    const rows = await database.all(
      `SELECT user_id, username, discriminator, tickets_created, rating_average
       FROM users
       WHERE username LIKE ?
       ORDER BY tickets_created DESC
       LIMIT ?`,
      [`%${query}%`, limit]
    );

    return rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      discriminator: row.discriminator,
      ticketsCreated: row.tickets_created,
      ratingAverage: row.rating_average
    }));
  }

  /**
   * Get user activity over time
   * @param {string} userId - User ID
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Array of daily activity
   */
  static async getActivityHistory(userId, days = 30) {
    const rows = await database.all(
      `SELECT
       DATE(created_at) as date,
       COUNT(*) as tickets_created
       FROM tickets
       WHERE user_id = ? AND created_at >= date('now', '-${days} days')
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [userId]
    );

    return rows.map(row => ({
      date: row.date,
      ticketsCreated: row.tickets_created
    }));
  }

  /**
   * Delete user data (GDPR compliance)
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteUser(userId) {
    // Delete in correct order due to foreign key constraints
    await database.run('DELETE FROM ratings WHERE user_id = ?', [userId]);
    await database.run('DELETE FROM file_uploads WHERE user_id = ?', [userId]);
    await database.run('DELETE FROM games WHERE user_id = ?', [userId]);
    await database.run('DELETE FROM tickets WHERE user_id = ?', [userId]);
    await database.run('DELETE FROM users WHERE user_id = ?', [userId]);

    return true;
  }

  /**
   * Get user leaderboard
   * @param {string} type - Leaderboard type (tickets, ratings, games)
   * @param {number} limit - Number of results
   * @returns {Promise<Array>} Leaderboard data
   */
  static async getLeaderboard(type = 'tickets', limit = 10) {
    let sql, params;

    switch (type) {
      case 'tickets':
        sql = `SELECT user_id, username, tickets_created as score
               FROM users
               ORDER BY tickets_created DESC
               LIMIT ?`;
        params = [limit];
        break;

      case 'ratings':
        sql = `SELECT user_id, username, rating_average as score
               FROM users
               WHERE rating_count >= 5
               ORDER BY rating_average DESC
               LIMIT ?`;
        params = [limit];
        break;

      case 'games':
        sql = `SELECT user_id, username, games_played as score
               FROM users
               ORDER BY games_played DESC
               LIMIT ?`;
        params = [limit];
        break;

      default:
        throw new Error('Invalid leaderboard type');
    }

    const rows = await database.all(sql, params);

    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      username: row.username,
      score: row.score
    }));
  }
}

module.exports = User;
