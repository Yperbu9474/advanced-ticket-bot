// Utility functions for the Discord Ticket Bot

const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder, ChannelType } = require('discord.js');
const config = require('./config');

/**
 * Safely sanitize usernames for channel names
 * @param {string} username - The username to sanitize
 * @returns {string} Sanitized username
 */
function sanitizeUsername(username) {
  // Replace non-alphanumerics with '-', collapse repeated dashes and trim
  // leading/trailing dashes to keep channel names clean and avoid trailing '-'.
  if (!username || typeof username !== 'string') return 'user';
  let safe = username.toLowerCase().replace(/[^a-z0-9]/g, '-');
  // Collapse multiple dashes
  safe = safe.replace(/-+/g, '-');
  // Trim leading/trailing dashes
  safe = safe.replace(/^-|-$/g, '');
  // Ensure there's at least something
  if (safe.length === 0) safe = 'user';
  // Limit length to 90 characters to be safe for Discord channel name limits
  return safe.slice(0, 90);
}



/**
 * Check if user already has an open ticket
 * @param {string} safeUsername - Sanitized username
 * @param {Collection} channels - Guild channels collection
 * @returns {Channel|null} Existing ticket channel or null
 */
/**
 * Find an existing ticket channel for a user.
 * This is robust: it checks channel topic for the user's ID, permission overwrites, and
 * falls back to name matching. Use this instead of relying solely on sanitized usernames
 * which can collide.
 * @param {string} userId - Discord user id
 * @param {Collection} channels - Guild channels collection
 * @param {Guild} [guild] - Optional guild object for fetching members when needed
 * @returns {Channel|null} Existing ticket channel or null
 */
function findExistingTicketByUser(userId, channels, guild = null) {
  // First, try to find by channel topic which we set to include (userId)
  const byTopic = channels.find(channel => {
    if (!channel || !channel.topic) return false;
    return channel.topic.includes(`(${userId})`);
  });

  if (byTopic) return byTopic;

  // Next, try permission overwrites (a user-specific overwrite that allows ViewChannel)
  const byPermissions = channels.find(channel => {
    try {
      const overwrite = channel.permissionOverwrites && channel.permissionOverwrites.cache.get(userId);
      if (!overwrite) return false;
      const allowed = overwrite.allow ? overwrite.allow.toArray() : [];
      return allowed.includes('ViewChannel');
    } catch (err) {
      return false;
    }
  });

  if (byPermissions) return byPermissions;

  // Finally, fall back to name matching (kept for backwards compatibility).
  // This handles older channels named like `ticket-username` or `ticket-username-<id>`
  const byName = channels.find(channel => {
    if (!channel || !channel.name) return false;
    return channel.name.startsWith('ticket-') && (channel.name.endsWith(userId) || channel.name === `ticket-${userId}`);
  });

  return byName || null;
}

/**
 * Extract user ID from channel topic
 * @param {Channel} channel - The ticket channel
 * @returns {string|null} User ID or null
 */
function extractUserIdFromTopic(channel) {
  if (!channel.topic) return null;
  const userIdMatch = channel.topic.match(/\((\d+)\)$/);
  return userIdMatch ? userIdMatch[1] : null;
}

/**
 * Find ticket owner from channel permissions
 * @param {Channel} channel - The ticket channel
 * @param {Guild} guild - The guild
 * @returns {User|null} Ticket owner user or null
 */
async function findTicketOwnerFromPermissions(channel, guild) {
  const permissionOverwrites = channel.permissionOverwrites.cache;

  for (const [id, overwrite] of permissionOverwrites) {
    if (overwrite.type === 1 && id !== guild.id) { // OverwriteType.Member and not @everyone
      const allowedPerms = overwrite.allow.toArray();
      if (allowedPerms.includes('ViewChannel')) {
        try {
          const member = await guild.members.fetch(id);
          return member.user;
        } catch (error) {
          console.error(`Error fetching member ${id}:`, error.message);
        }
      }
    }
  }
  return null;
}

/**
 * Create a standard embed with consistent styling
 * @param {Object} options - Embed options
 * @param {string} options.title - Embed title
 * @param {string} options.description - Embed description
 * @param {number} options.color - Embed color (optional, defaults to config)
 * @param {Object} options.footer - Footer options
 * @param {Object} options.thumbnail - Thumbnail options
 * @param {Array} options.fields - Embed fields
 * @returns {EmbedBuilder} The created embed
 */
function createEmbed({ title, description, color = config.EMBED_COLOR, footer, thumbnail, fields = [] }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  if (footer) {
    embed.setFooter(footer);
  }

  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  if (fields.length > 0) {
    // Sanitize fields: ensure name and value are strings and within Discord limits
    const safeFields = fields
      .filter(f => f && f.name && (f.value !== undefined && f.value !== null))
      .map(f => ({
        name: String(f.name).slice(0, 256),
        value: String(f.value).slice(0, 1024),
        inline: !!f.inline
      }));

    if (safeFields.length > 0) embed.addFields(safeFields);
  }

  return embed;
}

/**
 * Format a timestamp for Discord
 * @param {Date|number} timestamp - Timestamp to format
 * @param {string} format - Discord timestamp format (F, f, D, d, T, t, R)
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp, format = 'F') {
  const ts = Math.floor(new Date(timestamp).getTime() / 1000);
  return `<t:${ts}:${format}>`;
}

/**
 * Calculate time difference in human readable format
 * @param {Date|number} start - Start time
 * @param {Date|number} end - End time (optional, defaults to now)
 * @returns {string} Human readable time difference
 */
function getTimeDifference(start, end = Date.now()) {
  const diff = Math.abs(end - start);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return 'Less than a minute';
}

/**
 * Validate file type and size for uploads
 * @param {Attachment} attachment - Discord attachment
 * @returns {boolean} Whether the file is valid
 */
function validateFileUpload(attachment) {
  if (attachment.size > config.MAX_FILE_SIZE) return false;
  if (!config.ALLOWED_FILE_TYPES.includes(attachment.contentType)) return false;
  return true;
}

/**
 * Generate a random string for various purposes
 * @param {number} length - Length of the string
 * @returns {string} Random string
 */
function generateRandomString(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Check if user has staff permissions
 * @param {GuildMember} member - Guild member
 * @returns {boolean} Whether user has staff permissions
 */
function hasStaffPermissions(member) {
  return member.roles.cache.some(role => config.STAFF_ROLES.includes(role.id));
}

/**
 * Rate limiting helper
 * @param {Map} rateLimitMap - Map to store rate limit data
 * @param {string} key - Rate limit key
 * @param {Object} limits - Rate limit configuration
 * @returns {boolean} Whether the action is allowed
 */
function checkRateLimit(rateLimitMap, key, limits) {
  const now = Date.now();
  const userLimits = rateLimitMap.get(key) || { count: 0, resetTime: now + limits.WINDOW_MS };

  if (now > userLimits.resetTime) {
    userLimits.count = 1;
    userLimits.resetTime = now + limits.WINDOW_MS;
  } else {
    userLimits.count++;
  }

  rateLimitMap.set(key, userLimits);
  return userLimits.count <= limits.MAX_REQUESTS;
}

/**
 * Clean up old entries from rate limit map
 * @param {Map} rateLimitMap - Rate limit map to clean
 */
function cleanupRateLimits(rateLimitMap) {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path to create
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} File extension
 */
function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

/**
 * Format file size in human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  sanitizeUsername,
  // Backwards-compatible: export the new finder under two names
  findExistingTicketByUser,
  findExistingTicket: findExistingTicketByUser,
  extractUserIdFromTopic,
  findTicketOwnerFromPermissions,
  createEmbed,
  formatTimestamp,
  getTimeDifference,
  validateFileUpload,
  generateRandomString,
  hasStaffPermissions,
  checkRateLimit,
  cleanupRateLimits,
  ensureDirectoryExists,
  getFileExtension,
  formatFileSize,
  deepClone,
  sleep
};
