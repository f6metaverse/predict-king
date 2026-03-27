require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const { startScheduler, generateDailyPredictions } = require('./predictions-engine');
const { setBot, startResolveScheduler } = require('./auto-resolve');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'predict-king-admin-2026';

// Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
setBot(bot);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Validate Telegram WebApp initData (official Telegram signature check)
function validateTelegramData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    // Remove hash from params and sort alphabetically
    params.delete('hash');
    const dataCheckArr = [];
    for (const [key, value] of [...params.entries()].sort()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    const dataCheckString = dataCheckArr.join('\n');

    // Create HMAC with bot token
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash !== hash) return null;

    // Check if data is not too old (allow 24h for Mini Apps that stay open)
    const authDate = parseInt(params.get('auth_date'));
    if (authDate && Date.now() / 1000 - authDate > 86400) return null;

    // Extract user
    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

// Middleware: require valid Telegram user for user-facing routes
function requireTelegramUser(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];

  // Validate Telegram signature
  const tgUser = validateTelegramData(initData);
  if (tgUser) {
    req.telegramUser = tgUser;
    req.validatedUserId = tgUser.id.toString();
    return next();
  }

  // Dev mode fallback (only if no ADMIN_SECRET is set in env = local dev)
  if (!process.env.ADMIN_SECRET) {
    return next();
  }

  return res.status(403).json({ error: 'Invalid Telegram authentication' });
}

// Middleware: require admin secret for dangerous routes
function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.body?.adminSecret;
  if (secret === ADMIN_SECRET) {
    return next();
  }
  return res.status(403).json({ error: 'Unauthorized' });
}

// Rate limiter — prevent spam/abuse
const rateLimits = {};
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = req.validatedUserId || req.ip;
    const now = Date.now();

    if (!rateLimits[key]) {
      rateLimits[key] = { count: 1, resetAt: now + windowMs };
      return next();
    }

    if (now > rateLimits[key].resetAt) {
      rateLimits[key] = { count: 1, resetAt: now + windowMs };
      return next();
    }

    rateLimits[key].count++;
    if (rateLimits[key].count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests, slow down' });
    }
    return next();
  };
}

// Clean up rate limit entries every 10 min
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(rateLimits)) {
    if (now > rateLimits[key].resetAt) delete rateLimits[key];
  }
}, 10 * 60 * 1000);

// Input sanitizer — strip HTML/scripts from user input
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>]/g, '').trim();
}

// --- API Routes ---

// Get active predictions (public — no auth needed, it's read-only)
app.get('/api/predictions', async (req, res) => {
  try {
    const predictions = await db.getActivePredictions();
    const userId = req.query.userId;
    let userVotes = {};
    if (userId) {
      userVotes = await db.getUserVotes(userId);
    }
    const mapped = predictions.map(p => ({
      ...p,
      userVote: userVotes[p.id]?.choice || null,
      totalVotes: p.votesA + p.votesB,
      percentA: p.votesA + p.votesB > 0 ? Math.round((p.votesA / (p.votesA + p.votesB)) * 100) : 50,
      percentB: p.votesA + p.votesB > 0 ? Math.round((p.votesB / (p.votesA + p.votesB)) * 100) : 50
    }));
    res.json(mapped);
  } catch (e) {
    console.error('Get predictions error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate tweet suggestions from active predictions (public — no auth needed)
app.get('/api/tweets', async (req, res) => {
  try {
    const predictions = await db.getActivePredictions();
    // Limit to 20 most recent
    const recent = predictions.slice(0, 20);

    const hashtagMap = {
      football: '#Football #Soccer',
      nba: '#NBA #Basketball',
      combat: '#UFC #MMA',
      combat_news: '#UFC #MMA',
      f1: '#F1 #Racing',
      motorsport: '#F1 #Racing',
      nfl: '#NFL #Football',
      hockey: '#NHL #Hockey',
      rugby: '#Rugby',
      crypto: '#Crypto #Bitcoin',
      musique: '#Music',
      gaming: '#Gaming',
      esports: '#Gaming',
      cinema: '#Movies',
      politics: '#Politics',
      business: '#Business #Stocks'
    };

    const suffix = '\n\n👑 @PredictKingApp\nt.me/PredictKingAppBot';

    const result = recent.map(p => {
      const catHashtags = (hashtagMap[p.category] || '#Predictions') + ' #PredictKing';

      const debateText = `${p.question} 🤔\n\n${p.optionA} or ${p.optionB}? Drop your pick 👇\n\n${catHashtags}${suffix}`;
      const boldText = `${p.optionA} is the answer 🔥\n\nWhat do you think?\n\n${catHashtags}${suffix}`;

      return {
        predictionId: p.id,
        category: p.category,
        question: p.question,
        tweets: [
          { type: 'debate', text: debateText.slice(0, 280) },
          { type: 'bold_take', text: boldText.slice(0, 280) }
        ]
      };
    });

    res.json(result);
  } catch (e) {
    console.error('Tweets API error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Vote on a prediction (requires Telegram auth + rate limited)
app.post('/api/vote', requireTelegramUser, rateLimit(30, 60000), async (req, res) => {
  const { predictionId, choice } = req.body;
  // Use validated userId from Telegram, not from body (prevents spoofing)
  const userId = req.validatedUserId || req.body.userId;
  if (!predictionId || !userId || !choice) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (choice !== 'A' && choice !== 'B') {
    return res.status(400).json({ error: 'Invalid choice' });
  }

  try {
    const prediction = await db.getPrediction(predictionId);
    if (!prediction) return res.status(404).json({ error: 'Prediction not found' });
    if (prediction.resolved) return res.status(400).json({ error: 'Prediction already resolved' });

    const existing = await db.getVote(predictionId, userId);
    if (existing) return res.status(400).json({ error: 'Already voted' });

    await db.addVote(predictionId, userId, choice);

    // Update user stats
    const user = await db.getUser(userId) || {};
    await db.createOrUpdateUser(userId, {
      ...user,
      totalPredictions: (user.totalPredictions || 0) + 1
    });

    const updated = await db.getPrediction(predictionId);
    res.json({
      success: true,
      votesA: updated.votesA,
      votesB: updated.votesB,
      totalVotes: updated.votesA + updated.votesB,
      percentA: Math.round((updated.votesA / (updated.votesA + updated.votesB)) * 100),
      percentB: Math.round((updated.votesB / (updated.votesA + updated.votesB)) * 100)
    });
  } catch (e) {
    console.error('Vote error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile (requires Telegram auth — users can only see their own profile)
app.get('/api/user/:id', requireTelegramUser, async (req, res) => {
  try {
    // Users can only access their own profile
    const requestedId = req.params.id;
    if (req.validatedUserId && req.validatedUserId !== requestedId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const user = await db.getUser(requestedId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    console.error('Get user error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register / update user (requires Telegram auth)
app.post('/api/user', requireTelegramUser, async (req, res) => {
  // Use validated Telegram ID, not user-supplied ID
  const id = req.validatedUserId || req.body.id;
  const { username, firstName, referredBy } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing user id' });

  try {
    let existingUser = await db.getUser(id);
    const isNew = !existingUser;

    const user = await db.createOrUpdateUser(id, {
      username: sanitize(username),
      firstName: sanitize(firstName)
    });

    // Handle referral
    if (isNew && referredBy && referredBy !== id) {
      const referrer = await db.getUser(referredBy);
      if (referrer) {
        await db.createOrUpdateUser(id, { ...user, referredBy });
        await db.createOrUpdateUser(referredBy, {
          ...referrer,
          referralCount: (referrer.referralCount || 0) + 1,
          points: (referrer.points || 0) + 50
        });
      }
    }

    res.json(user);
  } catch (e) {
    console.error('User error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Daily bonus (requires Telegram auth + rate limited)
app.post('/api/daily-bonus', requireTelegramUser, rateLimit(5, 60000), async (req, res) => {
  const userId = req.validatedUserId || req.body.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const user = await db.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const today = new Date().toDateString();
    const lastBonus = user.lastBonusDate;

    if (lastBonus === today) {
      return res.json({ success: false, message: 'Already claimed today' });
    }

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const bonusStreak = lastBonus === yesterday ? (user.bonusStreak || 0) + 1 : 1;
    const bonus = Math.min(10 + (bonusStreak * 5), 50);

    const updated = await db.createOrUpdateUser(userId, {
      ...user,
      points: (user.points || 0) + bonus,
      lastBonusDate: today,
      bonusStreak: bonusStreak
    });

    res.json({
      success: true,
      bonus,
      points: updated.points,
      streak: bonusStreak
    });
  } catch (e) {
    console.error('Daily bonus error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await db.getLeaderboard(50);
    res.json(leaderboard);
  } catch (e) {
    console.error('Leaderboard error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve a prediction (ADMIN ONLY)
app.post('/api/resolve', requireAdmin, async (req, res) => {
  const { predictionId, result } = req.body;
  if (!predictionId || !result) return res.status(400).json({ error: 'Missing fields' });

  try {
    const prediction = await db.resolvePrediction(predictionId, result);
    if (!prediction) return res.status(404).json({ error: 'Prediction not found' });

    // Award points to winners
    const allUsers = await db.getAllUsers();

    for (const userId of Object.keys(allUsers)) {
      const vote = await db.getVote(predictionId, userId);
      if (!vote) continue;
      const user = allUsers[userId];

      if (vote.choice === result) {
        const newStreak = (user.streak || 0) + 1;
        const streakBonus = Math.min(newStreak * 5, 50);
        await db.createOrUpdateUser(userId, {
          ...user,
          points: (user.points || 0) + 10 + streakBonus,
          streak: newStreak,
          bestStreak: Math.max(newStreak, user.bestStreak || 0),
          correctPredictions: (user.correctPredictions || 0) + 1
        });
      } else {
        await db.createOrUpdateUser(userId, { ...user, streak: 0 });
      }
    }

    res.json({ success: true, prediction });
  } catch (e) {
    console.error('Resolve error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add prediction (ADMIN ONLY)
app.post('/api/predictions', requireAdmin, async (req, res) => {
  const { question, category, optionA, optionB, emoji, expiresAt } = req.body;
  if (!question || !optionA || !optionB) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    const prediction = await db.addPrediction({
      question,
      category: category || 'general',
      optionA,
      optionB,
      emoji: emoji || '',
      expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    res.json(prediction);
  } catch (e) {
    console.error('Add prediction error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Ad reward (requires Telegram auth + rate limited to prevent abuse)
app.post('/api/ad-reward', requireTelegramUser, rateLimit(10, 60000), async (req, res) => {
  const userId = req.validatedUserId || req.body.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const user = await db.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updated = await db.createOrUpdateUser(userId, {
      ...user,
      points: (user.points || 0) + 5
    });

    res.json({ success: true, points: updated.points });
  } catch (e) {
    console.error('Ad reward error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Force regenerate predictions (ADMIN ONLY)
app.post('/api/generate', requireAdmin, async (req, res) => {
  try {
    const count = await generateDailyPredictions();
    res.json({ success: true, generated: count });
  } catch (e) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset predictions (ADMIN ONLY)
app.post('/api/reset-predictions', requireAdmin, async (req, res) => {
  try {
    await db.resetPredictions();
    const count = await generateDailyPredictions();
    res.json({ success: true, generated: count });
  } catch (e) {
    console.error('Reset error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- User History API ---
app.get('/api/history/:userId', async (req, res) => {
  try {
    const history = await db.getUserHistory(req.params.userId);
    res.json(history);
  } catch (e) {
    console.error('History error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Comments API ---

// Get comments for a prediction
app.get('/api/comments/:predictionId', async (req, res) => {
  try {
    const comments = await db.getComments(req.params.predictionId);
    res.json(comments);
  } catch (e) {
    console.error('Get comments error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Post a comment (requires Telegram auth + rate limited + sanitized)
app.post('/api/comments', requireTelegramUser, rateLimit(10, 60000), async (req, res) => {
  const { predictionId, text } = req.body;
  const userId = req.validatedUserId || req.body.userId;
  if (!predictionId || !userId || !text) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (text.length > 280) {
    return res.status(400).json({ error: 'Comment too long (280 max)' });
  }

  try {
    const user = await db.getUser(userId);
    const comment = await db.addComment(
      predictionId,
      userId,
      user?.username || '',
      user?.firstName || 'Player',
      sanitize(text)
    );
    res.json(comment);
  } catch (e) {
    console.error('Post comment error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Auto-generate predictions on startup ---
async function initPredictions() {
  // Auto-migrate: add metadata column if missing
  try {
    await db.pool.query(`ALTER TABLE predictions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`);
    console.log('DB migration: metadata column OK');
  } catch (e) {
    console.log('DB migration note:', e.message);
  }

  // Clean up old static predictions (no metadata = old engine) + old debate category
  try {
    const result = await db.pool.query(
      `DELETE FROM predictions WHERE resolved = FALSE AND (
        metadata IS NULL
        OR metadata::text = '{}'
        OR metadata::text = 'null'
        OR metadata::text = '""'
        OR category = 'debate'
        OR (metadata->>'type' IS NULL AND metadata->>'source' IS NULL AND metadata->>'fixtureId' IS NULL AND metadata->>'gameId' IS NULL AND metadata->>'coinId' IS NULL)
      )`
    );
    if (result.rowCount > 0) {
      console.log(`Cleanup: removed ${result.rowCount} old static predictions`);
    }
  } catch (e) {
    console.log('Cleanup note:', e.message);
  }

  // Clean up ALL unresolved combat predictions so the upgraded engine regenerates with main events
  try {
    const combatClean = await db.pool.query(
      `DELETE FROM predictions WHERE resolved = FALSE AND category = 'combat'`
    );
    if (combatClean.rowCount > 0) {
      console.log(`Cleanup: removed ${combatClean.rowCount} combat predictions for fresh regeneration with main events`);
    }
  } catch (e) {
    console.log('Combat cleanup note:', e.message);
  }

  // Force a full generation on startup
  console.log('Startup: generating fresh predictions...');
  await generateDailyPredictions();

  startScheduler();
  startResolveScheduler();
  startBroadcastScheduler();
}

// --- Telegram Bot Commands ---
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const referredBy = match[1]?.trim() || null;

  await db.createOrUpdateUser(userId, {
    username: msg.from.username || '',
    firstName: msg.from.first_name || 'Player',
    chatId: chatId.toString()
  });

  if (referredBy && referredBy !== userId) {
    const referrer = await db.getUser(referredBy);
    const existingUser = await db.getUser(userId);
    if (referrer && !existingUser?.referredBy) {
      await db.createOrUpdateUser(userId, { ...existingUser, referredBy });
      await db.createOrUpdateUser(referredBy, {
        ...referrer,
        referralCount: (referrer.referralCount || 0) + 1,
        points: (referrer.points || 0) + 50
      });
    }
  }

  bot.sendMessage(chatId,
    `*PREDICT KING*\n\nHey ${msg.from.first_name}! Think you can predict the future?\n\n*How it works:*\nVote on real predictions (sports, crypto, music, politics...)\nGet it right = earn points + build your streak\nClimb the global leaderboard\n\n*17 categories* with live data:\nFootball | NBA | UFC | F1 | Crypto | Music | Gaming | Drama | Politics & more\n\n*Bonuses:*\nDaily login = free points\nInvite a friend = +50 pts\nWatch an ad = +5 pts\n\nNew predictions drop every 8 hours. Results auto-resolved.\n\nAre you the Predict King? Prove it.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: 'Play Now', web_app: { url: APP_URL } }
        ], [
          { text: 'My Profile', callback_data: 'profile' },
          { text: 'Leaderboard', callback_data: 'leaderboard' }
        ], [
          { text: 'Invite a friend (+50 pts)', callback_data: 'invite' }
        ]]
      }
    }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();

  if (query.data === 'profile') {
    const user = await db.getUser(userId);
    if (!user) {
      bot.answerCallbackQuery(query.id, { text: 'Play first!' });
      return;
    }
    bot.sendMessage(chatId,
      `*${user.firstName}*\n\nPoints: ${user.points}\nStreak: ${user.streak}\nBest streak: ${user.bestStreak}\nPredictions: ${user.totalPredictions}\nCorrect: ${user.correctPredictions}\nReferrals: ${user.referralCount}`,
      { parse_mode: 'Markdown' }
    );
  }

  if (query.data === 'leaderboard') {
    const top = await db.getLeaderboard(10);
    if (top.length === 0) {
      bot.sendMessage(chatId, 'No players yet!');
      return;
    }
    const medals = ['1.', '2.', '3.'];
    const list = top.map((u, i) =>
      `${medals[i] || `${i + 1}.`} *${u.firstName}* - ${u.points} pts (streak: ${u.streak})`
    ).join('\n');
    bot.sendMessage(chatId, `*TOP 10*\n\n${list}`, { parse_mode: 'Markdown' });
  }

  if (query.data === 'invite') {
    const link = `https://t.me/PredictKingAppBot?start=${userId}`;
    bot.sendMessage(chatId,
      `*Invite your friends!*\n\nYou earn *50 points* for each friend who joins\n\nYour referral link:\n\`${link}\`\n\nShare it everywhere!`,
      { parse_mode: 'Markdown' }
    );
  }

  bot.answerCallbackQuery(query.id);
});

// --- Daily Broadcast ---
async function broadcastHotPredictions() {
  try {
    const predictions = await db.getActivePredictions();
    if (predictions.length === 0) return;

    // Pick top 3 most voted predictions
    const hot = [...predictions]
      .sort((a, b) => (b.votesA + b.votesB) - (a.votesA + a.votesB))
      .slice(0, 3);

    const predList = hot.map((p, i) => {
      const total = p.votesA + p.votesB;
      return `${i + 1}. ${p.emoji} *${p.question}*${total > 0 ? ` (${total} votes)` : ''}`;
    }).join('\n\n');

    const message = `*HOT PREDICTIONS TODAY*\n\n${predList}\n\nTap below to vote and earn points!`;

    const allUsers = await db.getAllUsers();
    let sent = 0;

    for (const userId of Object.keys(allUsers)) {
      const user = allUsers[userId];
      if (!user.chatId) continue;

      try {
        await bot.sendMessage(user.chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: 'Play Now', web_app: { url: APP_URL } }
            ]]
          }
        });
        sent++;
        // Small delay to avoid Telegram rate limits
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        // User blocked the bot or chat not found, skip
      }
    }

    console.log(`Broadcast sent to ${sent} users`);
  } catch (e) {
    console.error('Broadcast error:', e.message);
  }
}

// Schedule daily broadcast at 10:00 AM UTC
function startBroadcastScheduler() {
  console.log('Broadcast scheduler started');

  // Check every 30 minutes if it's time to broadcast
  setInterval(async () => {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    // Send at 10:00 UTC (12:00 Paris time) and 18:00 UTC (20:00 Paris time)
    if ((hour === 10 || hour === 18) && minute < 30) {
      const lastBroadcast = global._lastBroadcast || 0;
      if (Date.now() - lastBroadcast > 3600000) { // Don't send twice in an hour
        global._lastBroadcast = Date.now();
        await broadcastHotPredictions();
      }
    }
  }, 30 * 60 * 1000);
}

// Admin endpoint to trigger broadcast manually (ADMIN ONLY)
app.post('/api/broadcast', requireAdmin, async (req, res) => {
  try {
    await broadcastHotPredictions();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`\nPREDICT KING server running on port ${PORT}`);
  console.log(`Mini App URL: ${APP_URL}`);
  console.log(`Bot: @PredictKingAppBot\n`);
  initPredictions();
});
