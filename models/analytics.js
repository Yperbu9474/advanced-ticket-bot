// Analytics data model and operations

const database = require('./database');

class Analytics {
  /**
   * Log an analytics event
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<void>}
   */
  static async logEvent(metric, value = 1, metadata = {}) {
    const today = new Date().toISOString().split('T')[0];

    await database.run(
      `INSERT INTO analytics (date, metric, value, metadata)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date, metric) DO UPDATE SET
         value = value + ?`,
      [today, metric, value, JSON.stringify(metadata), value]
    );
  }

  /**
   * Get analytics data for a date range
   * @param {string} metric - Metric name (optional)
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Analytics data
   */
  static async getData(metric = null, startDate = null, endDate = null) {
    let sql = 'SELECT date, metric, value, metadata FROM analytics WHERE 1=1';
    const params = [];

    if (metric) {
      sql += ' AND metric = ?';
      params.push(metric);
    }

    if (startDate) {
      sql += ' AND date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY date DESC, metric ASC';

    const rows = await database.all(sql, params);

    return rows.map(row => ({
      date: row.date,
      metric: row.metric,
      value: row.value,
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }

  /**
   * Get daily statistics for a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Daily statistics
   */
  static async getDailyStats(startDate, endDate) {
    const rows = await database.all(
      `SELECT
       date,
       SUM(CASE WHEN metric = 'ticket_created' THEN value ELSE 0 END) as tickets_created,
       SUM(CASE WHEN metric = 'ticket_closed' THEN value ELSE 0 END) as tickets_closed,
       SUM(CASE WHEN metric = 'ticket_claimed' THEN value ELSE 0 END) as tickets_claimed,
       SUM(CASE WHEN metric = 'game_started' THEN value ELSE 0 END) as games_started,
       SUM(CASE WHEN metric = 'rating_submitted' THEN value ELSE 0 END) as ratings_submitted
       FROM analytics
       WHERE date BETWEEN ? AND ?
       GROUP BY date
       ORDER BY date DESC`,
      [startDate, endDate]
    );

    return rows.map(row => ({
      date: row.date,
      tickets: {
        created: row.tickets_created,
        closed: row.tickets_closed,
        claimed: row.tickets_claimed
      },
      games: {
        started: row.games_started
      },
      ratings: {
        submitted: row.ratings_submitted
      }
    }));
  }

  /**
   * Get summary statistics
   * @param {number} days - Number of days to look back
   * @returns {Promise<Object>} Summary statistics
   */
  static async getSummary(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const summary = await database.get(
      `SELECT
       SUM(CASE WHEN metric = 'ticket_created' THEN value ELSE 0 END) as total_tickets,
       SUM(CASE WHEN metric = 'ticket_closed' THEN value ELSE 0 END) as total_closed,
       SUM(CASE WHEN metric = 'ticket_claimed' THEN value ELSE 0 END) as total_claimed,
       SUM(CASE WHEN metric = 'game_started' THEN value ELSE 0 END) as total_games,
       SUM(CASE WHEN metric = 'rating_submitted' THEN value ELSE 0 END) as total_ratings,
       AVG(CASE WHEN metric = 'rating_submitted' THEN CAST(metadata AS INTEGER) ELSE NULL END) as avg_rating
       FROM analytics
       WHERE date >= ?`,
      [startDateStr]
    );

    // Get current active tickets
    const activeTickets = await database.get(
      "SELECT COUNT(*) as count FROM tickets WHERE status IN ('open', 'claimed')"
    );

    // Get total users
    const totalUsers = await database.get(
      "SELECT COUNT(*) as count FROM users"
    );

    return {
      period: `${days} days`,
      tickets: {
        total: summary.total_tickets || 0,
        closed: summary.total_closed || 0,
        claimed: summary.total_claimed || 0,
        active: activeTickets.count || 0
      },
      games: {
        total: summary.total_games || 0
      },
      ratings: {
        total: summary.total_ratings || 0,
        average: summary.avg_rating || 0
      },
      users: {
        total: totalUsers.count || 0
      }
    };
  }

  /**
   * Get ticket type distribution
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Ticket type distribution
   */
  static async getTicketTypeDistribution(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const rows = await database.all(
      `SELECT type, COUNT(*) as count
       FROM tickets
       WHERE created_at >= ?
       GROUP BY type
       ORDER BY count DESC`,
      [startDateStr]
    );

    return rows.map(row => ({
      type: row.type,
      count: row.count
    }));
  }

  /**
   * Get staff performance metrics
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Staff performance data
   */
  static async getStaffPerformance(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const rows = await database.all(
      `SELECT
       claimed_by as staff_id,
       COUNT(*) as tickets_claimed,
       AVG((julianday(closed_at) - julianday(claimed_at)) * 24 * 60) as avg_resolution_time_minutes
       FROM tickets
       WHERE claimed_by IS NOT NULL
       AND claimed_at >= ?
       GROUP BY claimed_by
       ORDER BY tickets_claimed DESC`,
      [startDateStr]
    );

    return rows.map(row => ({
      staffId: row.staff_id,
      ticketsClaimed: row.tickets_claimed,
      avgResolutionTime: row.avg_resolution_time_minutes || 0
    }));
  }

  /**
   * Get hourly activity pattern
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Hourly activity data
   */
  static async getHourlyActivity(days = 7) {
    const rows = await database.all(
      `SELECT
       strftime('%H', created_at) as hour,
       COUNT(*) as ticket_count
       FROM tickets
       WHERE created_at >= date('now', '-${days} days')
       GROUP BY strftime('%H', created_at)
       ORDER BY hour ASC`
    );

    return rows.map(row => ({
      hour: parseInt(row.hour),
      ticketCount: row.ticket_count
    }));
  }

  /**
   * Get game statistics
   * @param {number} days - Number of days to look back
   * @returns {Promise<Object>} Game statistics
   */
  static async getGameStats(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const gameStats = await database.get(
      `SELECT
       COUNT(*) as total_games,
       COUNT(DISTINCT user_id) as unique_players,
       SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as total_wins,
       SUM(CASE WHEN result = 'lose' THEN 1 ELSE 0 END) as total_losses,
       SUM(CASE WHEN result = 'tie' THEN 1 ELSE 0 END) as total_ties
       FROM games
       WHERE started_at >= ?`,
      [startDateStr]
    );

    const gameTypeStats = await database.all(
      `SELECT
       type,
       COUNT(*) as count,
       AVG(CASE WHEN ended_at IS NOT NULL THEN
         (julianday(ended_at) - julianday(started_at)) * 24 * 60 * 60
         ELSE NULL END) as avg_duration_seconds
       FROM games
       WHERE started_at >= ?
       GROUP BY type
       ORDER BY count DESC`,
      [startDateStr]
    );

    return {
      overview: {
        totalGames: gameStats.total_games || 0,
        uniquePlayers: gameStats.unique_players || 0,
        totalWins: gameStats.total_wins || 0,
        totalLosses: gameStats.total_losses || 0,
        totalTies: gameStats.total_ties || 0
      },
      byType: gameTypeStats.map(stat => ({
        type: stat.type,
        count: stat.count,
        avgDuration: stat.avg_duration_seconds || 0
      }))
    };
  }

  /**
   * Export analytics data
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Exported data
   */
  static async exportData(startDate, endDate) {
    const [dailyStats, ticketTypes, staffPerformance, hourlyActivity, gameStats] = await Promise.all([
      this.getDailyStats(startDate, endDate),
      this.getTicketTypeDistribution(30),
      this.getStaffPerformance(30),
      this.getHourlyActivity(7),
      this.getGameStats(30)
    ]);

    return {
      exportDate: new Date().toISOString(),
      dateRange: { startDate, endDate },
      summary: await this.getSummary(30),
      dailyStats,
      ticketTypes,
      staffPerformance,
      hourlyActivity,
      gameStats
    };
  }

  /**
   * Clean up old analytics data
   * @param {number} retentionDays - Number of days to retain
   * @returns {Promise<number>} Number of records deleted
   */
  static async cleanup(retentionDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const result = await database.run(
      'DELETE FROM analytics WHERE date < ?',
      [cutoffDateStr]
    );

    return result.changes;
  }
}

module.exports = Analytics;
