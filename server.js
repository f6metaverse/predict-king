require('dotenv').config();
const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const { startScheduler, generateDailyPredictions } = require('./predictions-engine');
const { setBot, startResolveScheduler } = require('./auto-resolve');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
setBot(bot);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// Get active predictions
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

// Vote on a prediction
app.post('/api/vote', async (req, res) => {
  const { predictionId, userId, choice } = req.body;
  if (!predictionId || !userId || !choice) {
    return res.status(400).json({ error: 'Missing fields' });
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

// Get user profile
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await db.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    console.error('Get user error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register / update user
app.post('/api/user', async (req, res) => {
  const { id, username, firstName, referredBy } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing user id' });

  try {
    let existingUser = await db.getUser(id);
    const isNew = !existingUser;

    const user = await db.createOrUpdateUser(id, { username, firstName });

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

// Daily bonus
app.post('/api/daily-bonus', async (req, res) => {
  const { userId } = req.body;
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

// Resolve a prediction (admin)
app.post('/api/resolve', async (req, res) => {
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

// Add prediction (admin)
app.post('/api/predictions', async (req, res) => {
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

// Ad reward
app.post('/api/ad-reward', async (req, res) => {
  const { userId } = req.body;
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

// Force regenerate predictions (admin)
app.post('/api/generate', async (req, res) => {
  try {
    const count = await generateDailyPredictions();
    res.json({ success: true, generated: count });
  } catch (e) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset predictions (admin)
app.post('/api/reset-predictions', async (req, res) => {
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

// Post a comment
app.post('/api/comments', async (req, res) => {
  const { predictionId, userId, text } = req.body;
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
      text.trim()
    );
    res.json(comment);
  } catch (e) {
    console.error('Post comment error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Auto-generate predictions on startup ---
async function initPredictions() {
  const existing = await db.getActivePredictions();
  if (existing.length < 5) {
    console.log('Generating initial predictions...');
    await generateDailyPredictions();
  }
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
    `*PREDICT KING*\n\nWelcome ${msg.from.first_name}!\n\nMake predictions on sports, crypto, pop culture...\nEarn points and climb the leaderboard\nKeep your streak for bonus points\nInvite friends for bonus points\n\nTap below to play!`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: 'Play', web_app: { url: APP_URL } }
        ], [
          { text: 'My Profile', callback_data: 'profile' },
          { text: 'Leaderboard', callback_data: 'leaderboard' }
        ], [
          { text: 'Invite a friend', callback_data: 'invite' }
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

// Admin endpoint to trigger broadcast manually
app.post('/api/broadcast', async (req, res) => {
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
