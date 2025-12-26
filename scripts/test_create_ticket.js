// Lightweight test harness for createTicket (no real Discord connection)
const path = require('path');

// Helper to stub a module in require.cache before other modules load
function stubModule(modulePath, exportsObj) {
  const full = require.resolve(require('path').resolve(__dirname, '..', modulePath));
  require.cache[full] = {
    id: full,
    filename: full,
    loaded: true,
    exports: exportsObj
  };
}

// Stub the Ticket model so we don't touch the real DB
stubModule('./models/ticket.js', {
  create: async (ticketData) => {
    console.log('[stub Ticket.create] called with', ticketData.ticketId);
    return {
      id: 1,
      ticketId: ticketData.ticketId,
      channelId: ticketData.channelId,
      userId: ticketData.userId,
      username: ticketData.username
    };
  },
  findByChannelId: async (channelId) => null,
  claim: async () => true,
  close: async () => true
});

// Stub the User model to avoid DB calls during tests
stubModule('./models/user.js', {
  addRating: async (userId, rating) => {
    console.log('[stub User.addRating]', userId, rating);
    return true;
  },
  findById: async (userId) => ({ userId, username: 'TestUser', ratingAverage: 0, ratingCount: 0 })
});

// Stub Analytics
stubModule('./models/analytics.js', {
  logEvent: async (event, value) => {
    console.log('[stub Analytics.logEvent]', event, value);
    return true;
  }
});

// Keep other modules real
const TicketHandler = require(require('path').resolve(__dirname, '..', 'handlers', 'ticketHandler'));
const utils = require(require('path').resolve(__dirname, '..', 'utils'));

// Build a minimal fake guild/channel system
function makeChannel(id, opts = {}) {
  return {
    id,
    name: opts.name || `chan-${id}`,
    type: opts.type || 0,
    topic: opts.topic || null,
    permissionOverwrites: { cache: new Map() },
    send: async (payload) => {
      console.log(`[channel ${id}.send]`, payload && (payload.content || payload.embeds ? 'embed/content' : 'payload'));
      return { attachments: { first: () => null } };
    },
    messages: {
      async fetch() { return new Map(); }
    }
  };
}

const fakeGuild = {
  id: 'guild1',
  members: {
    async fetch(id) {
      return { id, permissions: { has: () => true } };
    }
  },
  channels: {
    cache: new Map(),
    async fetch(id) {
      const c = this.cache.get(id);
      if (!c) throw new Error('NotFound');
      return c;
    },
    async create(options) {
      const newId = `chan_${Math.random().toString(36).slice(2,8)}`;
      const ch = makeChannel(newId, { name: options.name, type: options.type, topic: options.topic });
      // Map by id
      ch.guild = fakeGuild; // attach guild reference used by handlers
      this.cache.set(newId, ch);
      console.log('[guild.channels.create] created', ch.name, 'parent=', options.parent);
      return ch;
    }
  }
};

// Put existing log channel and close channel in cache so upload path is exercised
const openLog = makeChannel('openlog', { name: 'open-log', type: 0 });
const closeLog = makeChannel('closelog', { name: 'close-log', type: 0 });
fakeGuild.channels.cache.set('1421915774087598293', openLog); // OPEN_LOG_CHANNEL_ID per config
fakeGuild.channels.cache.set('1421915778269184110', closeLog); // CLOSE_LOG_CHANNEL_ID

// Add the star log channel to both guild and a fake global client cache to simulate configured channel
const starLog = makeChannel('starlog', { name: 'star-log', type: 0 });
fakeGuild.channels.cache.set('1421915686959186080', starLog); // STAR_LOG_CHANNEL_ID


// Interaction mock - minimal needed methods
const fakeInteraction = {
  user: { id: 'user123', username: 'TestUser', tag: 'TestUser#0001', send: async (x) => console.log('[DM send]', x && x.embeds ? 'embed' : x) },
  guild: fakeGuild,
  async editReply(obj) { console.log('[interaction.editReply]', obj); },
  async reply(obj) { console.log('[interaction.reply]', obj); }
};

// Minimal client mock with channels cache and fetch for global channel lookup
const client = {
  user: { id: 'bot123' },
  channels: { cache: new Map(), async fetch(id) { return this.cache.get(id) || null; } }
};

// Populate the fake client's global channel cache so handlers can find STAR_LOG_CHANNEL_ID
if (client.channels && client.channels.cache) {
  client.channels.cache.set('1421915686959186080', starLog);
}

(async () => {
  try {
    const handler = new TicketHandler(client);

    console.log('=== Running createTicket test ===');

    await handler.createTicket(fakeInteraction, { type: 'support', data: { problemDescription: 'Test issue', priority: 'normal' } });

    console.log('=== createTicket completed ===');

    // Simulate rating button click from the user
    const fakeRatingInteraction = {
      customId: 'rate_5',
      user: fakeInteraction.user,
      guild: fakeGuild,
      replied: false,
      deferred: false,
      async update(payload) { console.log('[rating interaction.update]', payload); this.replied = true; },
      async followUp(opts) { console.log('[rating interaction.followUp]', opts); }
    };

    await handler.handleRating(fakeRatingInteraction);

    console.log('=== rating simulated ===');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exitCode = 2;
  }
})();
