// Ticket data model and operations

const database = require('./database');
const config = require('../config');
const utils = require('../utils');

class Ticket {
  /**
   * Create a new ticket
   * @param {Object} ticketData - Ticket data
   * @returns {Promise<Object>} Created ticket
   */
  static async create(ticketData) {
    const {
      ticketId,
      channelId,
      userId,
      username,
      type,
      priority = 'normal',
      data = {}
    } = ticketData;

    const result = await database.run(
      `INSERT INTO tickets (ticket_id, channel_id, user_id, username, type, priority, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, channelId, userId, username, type, priority, JSON.stringify(data)]
    );

    // Update user ticket count
    await database.run(
      `INSERT INTO users (user_id, username, tickets_created)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id) DO UPDATE SET
         tickets_created = tickets_created + 1,
         last_seen = CURRENT_TIMESTAMP`,
      [userId, username]
    );

    // Log analytics
    await this.logAnalytics('ticket_created', 1, { type, priority });

    return {
      id: result.id,
      ticketId,
      channelId,
      userId,
      username,
      type,
      priority,
      status: 'open',
      createdAt: new Date()
    };
  }

  /**
   * Find ticket by ID
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<Object|null>} Ticket data or null
   */
  static async findById(ticketId) {
    const row = await database.get(
      'SELECT * FROM tickets WHERE ticket_id = ?',
      [ticketId]
    );

    if (!row) return null;

    return {
      id: row.id,
      ticketId: row.ticket_id,
      channelId: row.channel_id,
      userId: row.user_id,
      username: row.username,
      type: row.type,
      priority: row.priority,
      status: row.status,
      createdAt: new Date(row.created_at),
      claimedBy: row.claimed_by,
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
      closedBy: row.closed_by,
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
      closeReason: row.close_reason,
      transcriptPath: row.transcript_path,
      data: JSON.parse(row.data || '{}')
    };
  }

  /**
   * Find ticket by channel ID
   * @param {string} channelId - Channel ID
   * @returns {Promise<Object|null>} Ticket data or null
   */
  static async findByChannelId(channelId) {
    const row = await database.get(
      'SELECT * FROM tickets WHERE channel_id = ?',
      [channelId]
    );

    if (!row) return null;

    return {
      id: row.id,
      ticketId: row.ticket_id,
      channelId: row.channel_id,
      userId: row.user_id,
      username: row.username,
      type: row.type,
      priority: row.priority,
      status: row.status,
      createdAt: new Date(row.created_at),
      claimedBy: row.claimed_by,
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
      closedBy: row.closed_by,
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
      closeReason: row.close_reason,
      transcriptPath: row.transcript_path,
      data: JSON.parse(row.data || '{}')
    };
  }

  /**
   * Find tickets by user ID
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of tickets
   */
  static async findByUserId(userId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;

    let sql = 'SELECT * FROM tickets WHERE user_id = ?';
    const params = [userId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await database.all(sql, params);

    return rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      channelId: row.channel_id,
      userId: row.user_id,
      username: row.username,
      type: row.type,
      priority: row.priority,
      status: row.status,
      createdAt: new Date(row.created_at),
      claimedBy: row.claimed_by,
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
      closedBy: row.closed_by,
      closedAt: row.closed_at ? new Date(row.closed_at) : null,
      closeReason: row.close_reason,
      transcriptPath: row.transcript_path,
      data: JSON.parse(row.data || '{}')
    }));
  }

  /**
   * Claim a ticket
   * @param {string} ticketId - Ticket ID
   * @param {string} staffId - Staff user ID
   * @returns {Promise<boolean>} Success status
   */
  static async claim(ticketId, staffId) {
    const result = await database.run(
      `UPDATE tickets SET
       claimed_by = ?,
       claimed_at = CURRENT_TIMESTAMP,
       status = 'claimed'
       WHERE ticket_id = ? AND status = 'open'`,
      [staffId, ticketId]
    );

    if (result.changes > 0) {
      await this.logAnalytics('ticket_claimed', 1);
      return true;
    }

    return false;
  }

  /**
   * Close a ticket
   * @param {string} ticketId - Ticket ID
   * @param {string} staffId - Staff user ID
   * @param {string} reason - Close reason
   * @param {string} transcriptPath - Path to transcript file
   * @returns {Promise<boolean>} Success status
   */
  static async close(ticketId, staffId, reason, transcriptPath = null) {
    const result = await database.run(
      `UPDATE tickets SET
       closed_by = ?,
       closed_at = CURRENT_TIMESTAMP,
       close_reason = ?,
       transcript_path = ?,
       status = 'closed'
       WHERE ticket_id = ? AND status IN ('open', 'claimed')`,
      [staffId, reason, transcriptPath, ticketId]
    );

    if (result.changes > 0) {
      // Update user ticket closed count
      const ticket = await this.findById(ticketId);
      if (ticket) {
        await database.run(
          `UPDATE users SET tickets_closed = tickets_closed + 1 WHERE user_id = ?`,
          [ticket.userId]
        );
      }

      await this.logAnalytics('ticket_closed', 1, { reason });
      return true;
    }

    return false;
  }

  /**
   * Update ticket priority
   * @param {string} ticketId - Ticket ID
   * @param {string} priority - New priority
   * @returns {Promise<boolean>} Success status
   */
  static async updatePriority(ticketId, priority) {
    if (!config.PRIORITIES[priority.toUpperCase()]) {
      throw new Error('Invalid priority level');
    }

    const result = await database.run(
      'UPDATE tickets SET priority = ? WHERE ticket_id = ?',
      [priority.toLowerCase(), ticketId]
    );

    return result.changes > 0;
  }

  /**
   * Get ticket statistics
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Statistics
   */
  static async getStats(filters = {}) {
    const { dateFrom, dateTo, type, status } = filters;

    let sql = 'SELECT COUNT(*) as total FROM tickets WHERE 1=1';
    const params = [];

    if (dateFrom) {
      sql += ' AND created_at >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      sql += ' AND created_at <= ?';
      params.push(dateTo);
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    const totalResult = await database.get(sql, params);

    // Get stats by type
    const typeStats = await database.all(
      'SELECT type, COUNT(*) as count FROM tickets GROUP BY type'
    );

    // Get stats by status
    const statusStats = await database.all(
      'SELECT status, COUNT(*) as count FROM tickets GROUP BY status'
    );

    // Get average response time (claimed - created)
    const responseTimeResult = await database.get(`
      SELECT AVG(
        (julianday(claimed_at) - julianday(created_at)) * 24 * 60 * 60
      ) as avg_response_time_seconds
      FROM tickets
      WHERE claimed_at IS NOT NULL
    `);

    // Get average resolution time (closed - created)
    const resolutionTimeResult = await database.get(`
      SELECT AVG(
        (julianday(closed_at) - julianday(created_at)) * 24 * 60 * 60
      ) as avg_resolution_time_seconds
      FROM tickets
      WHERE closed_at IS NOT NULL
    `);

    return {
      total: totalResult.total,
      byType: typeStats.reduce((acc, stat) => {
        acc[stat.type] = stat.count;
        return acc;
      }, {}),
      byStatus: statusStats.reduce((acc, stat) => {
        acc[stat.status] = stat.count;
        return acc;
      }, {}),
      averageResponseTime: responseTimeResult.avg_response_time_seconds || 0,
      averageResolutionTime: resolutionTimeResult.avg_resolution_time_seconds || 0
    };
  }

  /**
   * Get active tickets
   * @returns {Promise<Array>} Array of active tickets
   */
  static async getActiveTickets() {
    const rows = await database.all(
      `SELECT * FROM tickets
       WHERE status IN ('open', 'claimed')
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
         END,
         created_at ASC`
    );

    return rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      channelId: row.channel_id,
      userId: row.user_id,
      username: row.username,
      type: row.type,
      priority: row.priority,
      status: row.status,
      createdAt: new Date(row.created_at),
      claimedBy: row.claimed_by,
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
      data: JSON.parse(row.data || '{}')
    }));
  }

  /**
   * Log analytics event
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {Object} metadata - Additional metadata
   */
  static async logAnalytics(metric, value = 1, metadata = {}) {
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
   * Save ticket transcript
   * @param {string} ticketId - Ticket ID
   * @param {string} transcriptPath - Path to transcript file
   * @returns {Promise<boolean>} Success status
   */
  static async saveTranscript(ticketId, transcriptPath) {
    const result = await database.run(
      'UPDATE tickets SET transcript_path = ? WHERE ticket_id = ?',
      [transcriptPath, ticketId]
    );

    return result.changes > 0;
  }

  /**
   * Add file upload to ticket
   * @param {Object} uploadData - Upload data
   * @returns {Promise<Object>} Created upload record
   */
  static async addFileUpload(uploadData) {
    const {
      ticketId,
      userId,
      filename,
      originalName,
      size,
      mimeType,
      path: filePath
    } = uploadData;

    const result = await database.run(
      `INSERT INTO file_uploads (ticket_id, user_id, filename, original_name, size, mime_type, path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, userId, filename, originalName, size, mimeType, filePath]
    );

    return {
      id: result.id,
      ticketId,
      userId,
      filename,
      originalName,
      size,
      mimeType,
      path: filePath,
      uploadedAt: new Date()
    };
  }

  /**
   * Get file uploads for ticket
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<Array>} Array of file uploads
   */
  static async getFileUploads(ticketId) {
    const rows = await database.all(
      'SELECT * FROM file_uploads WHERE ticket_id = ? ORDER BY uploaded_at DESC',
      [ticketId]
    );

    return rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      userId: row.user_id,
      filename: row.filename,
      originalName: row.original_name,
      size: row.size,
      mimeType: row.mime_type,
      path: row.path,
      uploadedAt: new Date(row.uploaded_at)
    }));
  }
}

module.exports = Ticket;
