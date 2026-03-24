const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 to avoid Railway IPv6 connectivity issues with Supabase
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- Users ---
async function getUser(telegramId) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [telegramId]);
  if (rows.length === 0) return null;
  return formatUser(rows[0]);
}

async function createOrUpdateUser(telegramId, data) {
  const existing = await getUser(telegramId);

  if (!existing) {
    const { rows } = await pool.query(
      `INSERT INTO users (id, username, first_name, points, streak, best_streak, total_predictions, correct_predictions, referred_by, referral_count, last_bonus_date, bonus_streak)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        telegramId,
        data.username || '',
        data.firstName || '',
        data.points || 0,
        data.streak || 0,
        data.bestStreak || 0,
        data.totalPredictions || 0,
        data.correctPredictions || 0,
        data.referredBy || null,
        data.referralCount || 0,
        data.lastBonusDate || null,
        data.bonusStreak || 0
      ]
    );
    return formatUser(rows[0]);
  }

  // Merge data
  const merged = { ...existing, ...data };
  const { rows } = await pool.query(
    `UPDATE users SET
      username = $2, first_name = $3, points = $4, streak = $5, best_streak = $6,
      total_predictions = $7, correct_predictions = $8, referred_by = $9, referral_count = $10,
      last_bonus_date = $11, bonus_streak = $12, last_active_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      telegramId,
      merged.username || '',
      merged.firstName || '',
      merged.points || 0,
      merged.streak || 0,
      merged.bestStreak || 0,
      merged.totalPredictions || 0,
      merged.correctPredictions || 0,
      merged.referredBy || null,
      merged.referralCount || 0,
      merged.lastBonusDate || null,
      merged.bonusStreak || 0
    ]
  );
  return formatUser(rows[0]);
}

async function getAllUsers() {
  const { rows } = await pool.query('SELECT * FROM users');
  const users = {};
  for (const row of rows) {
    users[row.id] = formatUser(row);
  }
  return users;
}

async function getLeaderboard(limit = 50) {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY points DESC LIMIT $1', [limit]);
  return rows.map(formatUser);
}

function formatUser(row) {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    points: row.points,
    streak: row.streak,
    bestStreak: row.best_streak,
    totalPredictions: row.total_predictions,
    correctPredictions: row.correct_predictions,
    joinedAt: row.joined_at,
    lastActiveAt: row.last_active_at,
    referredBy: row.referred_by,
    referralCount: row.referral_count,
    lastBonusDate: row.last_bonus_date,
    bonusStreak: row.bonus_streak
  };
}

// --- Predictions ---
async function getPredictions() {
  const { rows } = await pool.query('SELECT * FROM predictions ORDER BY created_at DESC');
  return rows.map(formatPrediction);
}

async function getActivePredictions() {
  const { rows } = await pool.query(
    'SELECT * FROM predictions WHERE resolved = FALSE AND expires_at > NOW() ORDER BY created_at DESC'
  );
  return rows.map(formatPrediction);
}

async function getPrediction(id) {
  const { rows } = await pool.query('SELECT * FROM predictions WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  return formatPrediction(rows[0]);
}

async function addPrediction(prediction) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { rows } = await pool.query(
    `INSERT INTO predictions (id, question, category, option_a, option_b, emoji, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, prediction.question, prediction.category || 'general', prediction.optionA, prediction.optionB, prediction.emoji || '', prediction.expiresAt]
  );
  return formatPrediction(rows[0]);
}

async function resolvePrediction(id, result) {
  const { rows } = await pool.query(
    'UPDATE predictions SET resolved = TRUE, result = $2, resolved_at = NOW() WHERE id = $1 RETURNING *',
    [id, result]
  );
  if (rows.length === 0) return null;
  return formatPrediction(rows[0]);
}

function formatPrediction(row) {
  return {
    id: row.id,
    question: row.question,
    category: row.category,
    optionA: row.option_a,
    optionB: row.option_b,
    emoji: row.emoji,
    votesA: row.votes_a,
    votesB: row.votes_b,
    resolved: row.resolved,
    result: row.result,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  };
}

// --- Votes ---
async function getVote(predictionId, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM votes WHERE prediction_id = $1 AND user_id = $2',
    [predictionId, userId]
  );
  if (rows.length === 0) return null;
  return formatVote(rows[0]);
}

async function getUserVotes(userId) {
  const { rows } = await pool.query('SELECT * FROM votes WHERE user_id = $1', [userId]);
  const userVotes = {};
  for (const row of rows) {
    userVotes[row.prediction_id] = formatVote(row);
  }
  return userVotes;
}

async function addVote(predictionId, userId, choice) {
  try {
    const { rows } = await pool.query(
      'INSERT INTO votes (prediction_id, user_id, choice) VALUES ($1, $2, $3) RETURNING *',
      [predictionId, userId, choice]
    );

    // Update prediction vote count
    const col = choice === 'A' ? 'votes_a' : 'votes_b';
    await pool.query(`UPDATE predictions SET ${col} = ${col} + 1 WHERE id = $1`, [predictionId]);

    return formatVote(rows[0]);
  } catch (e) {
    // Duplicate vote (primary key violation)
    return null;
  }
}

function formatVote(row) {
  return {
    predictionId: row.prediction_id,
    userId: row.user_id,
    choice: row.choice,
    votedAt: row.voted_at
  };
}

// --- Comments ---
async function addComment(predictionId, userId, username, firstName, text) {
  const { rows } = await pool.query(
    `INSERT INTO comments (prediction_id, user_id, username, first_name, text)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [predictionId, userId, username, firstName, text]
  );
  return formatComment(rows[0]);
}

async function getComments(predictionId, limit = 50) {
  const { rows } = await pool.query(
    'SELECT * FROM comments WHERE prediction_id = $1 ORDER BY created_at DESC LIMIT $2',
    [predictionId, limit]
  );
  return rows.map(formatComment);
}

async function getCommentCount(predictionId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM comments WHERE prediction_id = $1',
    [predictionId]
  );
  return parseInt(rows[0].count);
}

function formatComment(row) {
  return {
    id: row.id,
    predictionId: row.prediction_id,
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    text: row.text,
    createdAt: row.created_at
  };
}

// --- Reset (admin) ---
async function resetPredictions() {
  await pool.query('DELETE FROM votes');
  await pool.query('DELETE FROM comments');
  await pool.query('DELETE FROM predictions');
}

module.exports = {
  getUser, createOrUpdateUser, getAllUsers, getLeaderboard,
  getPredictions, getActivePredictions, getPrediction, addPrediction, resolvePrediction, resetPredictions,
  getVote, getUserVotes, addVote,
  addComment, getComments, getCommentCount,
  pool
};
