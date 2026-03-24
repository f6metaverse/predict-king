require('dotenv').config();
const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const { startScheduler, generateDailyPredictions } = require('./predictions-engine');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// Get active predictions
app.get('/api/predictions', (req, res) => {
  const predictions = db.getActivePredictions();
  const userId = req.query.userId;
  let userVotes = {};
  if (userId) {
    userVotes = db.getUserVotes(userId);
  }
  const mapped = predictions.map(p => ({
    ...p,
    userVote: userVotes[p.id]?.choice || null,
    totalVotes: p.votesA + p.votesB,
    percentA: p.votesA + p.votesB > 0 ? Math.round((p.votesA / (p.votesA + p.votesB)) * 100) : 50,
    percentB: p.votesA + p.votesB > 0 ? Math.round((p.votesB / (p.votesA + p.votesB)) * 100) : 50
  }));
  res.json(mapped);
});

// Vote on a prediction
app.post('/api/vote', (req, res) => {
  const { predictionId, userId, choice } = req.body;
  if (!predictionId || !userId || !choice) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const prediction = db.getPrediction(predictionId);
  if (!prediction) return res.status(404).json({ error: 'Prediction not found' });
  if (prediction.resolved) return res.status(400).json({ error: 'Prediction already resolved' });

  const existing = db.getVote(predictionId, userId);
  if (existing) return res.status(400).json({ error: 'Already voted' });

  const vote = db.addVote(predictionId, userId, choice);

  // Update user stats
  const user = db.getUser(userId) || {};
  db.createOrUpdateUser(userId, {
    totalPredictions: (user.totalPredictions || 0) + 1
  });

  const updated = db.getPrediction(predictionId);
  res.json({
    success: true,
    votesA: updated.votesA,
    votesB: updated.votesB,
    totalVotes: updated.votesA + updated.votesB,
    percentA: Math.round((updated.votesA / (updated.votesA + updated.votesB)) * 100),
    percentB: Math.round((updated.votesB / (updated.votesA + updated.votesB)) * 100)
  });
});

// Get user profile
app.get('/api/user/:id', (req, res) => {
  const user = db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Register / update user
app.post('/api/user', (req, res) => {
  const { id, username, firstName, referredBy } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing user id' });

  let existingUser = db.getUser(id);
  const isNew = !existingUser;

  const user = db.createOrUpdateUser(id, { username, firstName });

  // Handle referral
  if (isNew && referredBy && referredBy !== id) {
    const referrer = db.getUser(referredBy);
    if (referrer) {
      db.createOrUpdateUser(id, { referredBy });
      db.createOrUpdateUser(referredBy, {
        referralCount: (referrer.referralCount || 0) + 1,
        points: (referrer.points || 0) + 50 // bonus for referral
      });
    }
  }

  res.json(user);
});

// Daily bonus
app.post('/api/daily-bonus', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const user = db.getUser(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const today = new Date().toDateString();
  const lastBonus = user.lastBonusDate;

  if (lastBonus === today) {
    return res.json({ success: false, message: 'Already claimed today' });
  }

  // Check if yesterday was last bonus (for streak)
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const bonusStreak = lastBonus === yesterday ? (user.bonusStreak || 0) + 1 : 1;

  // More streak = more bonus (10 base + 5 per streak day, max 50)
  const bonus = Math.min(10 + (bonusStreak * 5), 50);

  const updated = db.createOrUpdateUser(userId, {
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
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = db.getLeaderboard(50);
  res.json(leaderboard);
});

// Resolve a prediction (admin)
app.post('/api/resolve', (req, res) => {
  const { predictionId, result } = req.body;
  if (!predictionId || !result) return res.status(400).json({ error: 'Missing fields' });

  const prediction = db.resolvePrediction(predictionId, result);
  if (!prediction) return res.status(404).json({ error: 'Prediction not found' });

  // Award points to winners
  const allUsers = db.getAllUsers();
  const votes = {};
  // Read all votes for this prediction
  for (const userId of Object.keys(allUsers)) {
    const vote = db.getVote(predictionId, userId);
    if (vote && vote.choice === result) {
      const user = allUsers[userId];
      const newStreak = (user.streak || 0) + 1;
      const streakBonus = Math.min(newStreak * 5, 50); // up to 50 bonus points for streak
      db.createOrUpdateUser(userId, {
        points: (user.points || 0) + 10 + streakBonus,
        streak: newStreak,
        bestStreak: Math.max(newStreak, user.bestStreak || 0),
        correctPredictions: (user.correctPredictions || 0) + 1
      });
    } else if (vote && vote.choice !== result) {
      const user = allUsers[userId];
      db.createOrUpdateUser(userId, {
        streak: 0 // reset streak on wrong prediction
      });
    }
  }

  res.json({ success: true, prediction });
});

// Add prediction (admin)
app.post('/api/predictions', (req, res) => {
  const { question, category, optionA, optionB, emoji, expiresAt } = req.body;
  if (!question || !optionA || !optionB) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const prediction = db.addPrediction({
    question,
    category: category || 'general',
    optionA,
    optionB,
    emoji: emoji || '🔮',
    expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
  res.json(prediction);
});

// Force regenerate predictions (admin)
app.post('/api/generate', async (req, res) => {
  const count = await generateDailyPredictions();
  res.json({ success: true, generated: count });
});

// --- Auto-generate predictions on startup ---
async function initPredictions() {
  const existing = db.getActivePredictions();
  if (existing.length < 5) {
    console.log('📡 Generating initial predictions...');
    await generateDailyPredictions();
  }
  startScheduler();
}

// --- Telegram Bot Commands ---
bot.onText(/\/start(.*)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const referredBy = match[1]?.trim() || null;

  db.createOrUpdateUser(userId, {
    username: msg.from.username || '',
    firstName: msg.from.first_name || 'Player'
  });

  if (referredBy && referredBy !== userId) {
    const referrer = db.getUser(referredBy);
    if (referrer && !db.getUser(userId)?.referredBy) {
      db.createOrUpdateUser(userId, { referredBy });
      db.createOrUpdateUser(referredBy, {
        referralCount: (referrer.referralCount || 0) + 1,
        points: (referrer.points || 0) + 50
      });
    }
  }

  bot.sendMessage(chatId,
    `👑 *PREDICT KING* 👑\n\nBienvenue ${msg.from.first_name} !\n\n🔮 Fais tes prédictions sur le sport, la crypto, la pop culture...\n🏆 Gagne des points et grimpe le classement\n🔥 Garde ta streak pour des bonus\n👥 Invite tes amis pour des points bonus\n\nClique ci-dessous pour jouer !`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮 Jouer', web_app: { url: APP_URL } }
        ], [
          { text: '📊 Mon profil', callback_data: 'profile' },
          { text: '🏆 Classement', callback_data: 'leaderboard' }
        ], [
          { text: '👥 Inviter un ami', callback_data: 'invite' }
        ]]
      }
    }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();

  if (query.data === 'profile') {
    const user = db.getUser(userId);
    if (!user) {
      bot.answerCallbackQuery(query.id, { text: 'Joue d\'abord !' });
      return;
    }
    bot.sendMessage(chatId,
      `👤 *${user.firstName}*\n\n⭐ Points: ${user.points}\n🔥 Streak: ${user.streak}\n🏆 Meilleure streak: ${user.bestStreak}\n📊 Predictions: ${user.totalPredictions}\n✅ Correctes: ${user.correctPredictions}\n👥 Parrainages: ${user.referralCount}`,
      { parse_mode: 'Markdown' }
    );
  }

  if (query.data === 'leaderboard') {
    const top = db.getLeaderboard(10);
    if (top.length === 0) {
      bot.sendMessage(chatId, 'Pas encore de joueurs !');
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    const list = top.map((u, i) =>
      `${medals[i] || `${i + 1}.`} *${u.firstName}* — ${u.points} pts (🔥${u.streak})`
    ).join('\n');
    bot.sendMessage(chatId, `🏆 *TOP 10*\n\n${list}`, { parse_mode: 'Markdown' });
  }

  if (query.data === 'invite') {
    const link = `https://t.me/PredictKingAppBot?start=${userId}`;
    bot.sendMessage(chatId,
      `👥 *Invite tes amis !*\n\n🎁 Tu gagnes *50 points* par ami qui rejoint\n\nTon lien de parrainage :\n\`${link}\`\n\nPartage-le partout !`,
      { parse_mode: 'Markdown' }
    );
  }

  bot.answerCallbackQuery(query.id);
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`\n👑 PREDICT KING server running on port ${PORT}`);
  console.log(`📱 Mini App URL: ${APP_URL}`);
  console.log(`🤖 Bot: @PredictKingAppBot\n`);
  initPredictions();
});
