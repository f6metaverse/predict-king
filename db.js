const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'predictions.json');
const VOTES_FILE = path.join(DATA_DIR, 'votes.json');

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
  if (!fs.existsSync(PREDICTIONS_FILE)) fs.writeFileSync(PREDICTIONS_FILE, '[]');
  if (!fs.existsSync(VOTES_FILE)) fs.writeFileSync(VOTES_FILE, '{}');
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return file.endsWith('users.json') || file.endsWith('votes.json') ? {} : [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Users ---
function getUser(telegramId) {
  const users = readJSON(USERS_FILE);
  return users[telegramId] || null;
}

function createOrUpdateUser(telegramId, data) {
  const users = readJSON(USERS_FILE);
  const existing = users[telegramId] || {
    id: telegramId,
    username: '',
    firstName: '',
    points: 0,
    streak: 0,
    bestStreak: 0,
    totalPredictions: 0,
    correctPredictions: 0,
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    referredBy: null,
    referralCount: 0
  };
  users[telegramId] = { ...existing, ...data, lastActiveAt: new Date().toISOString() };
  writeJSON(USERS_FILE, users);
  return users[telegramId];
}

function getAllUsers() {
  return readJSON(USERS_FILE);
}

function getLeaderboard(limit = 50) {
  const users = readJSON(USERS_FILE);
  return Object.values(users)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

// --- Predictions ---
function getPredictions() {
  return readJSON(PREDICTIONS_FILE);
}

function getActivePredictions() {
  const preds = readJSON(PREDICTIONS_FILE);
  const now = new Date();
  return preds.filter(p => !p.resolved && new Date(p.expiresAt) > now);
}

function getPrediction(id) {
  const preds = readJSON(PREDICTIONS_FILE);
  return preds.find(p => p.id === id) || null;
}

function addPrediction(prediction) {
  const preds = readJSON(PREDICTIONS_FILE);
  prediction.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  prediction.createdAt = new Date().toISOString();
  prediction.resolved = false;
  prediction.result = null;
  prediction.votesA = 0;
  prediction.votesB = 0;
  preds.push(prediction);
  writeJSON(PREDICTIONS_FILE, preds);
  return prediction;
}

function resolvePrediction(id, result) {
  const preds = readJSON(PREDICTIONS_FILE);
  const pred = preds.find(p => p.id === id);
  if (!pred) return null;
  pred.resolved = true;
  pred.result = result;
  pred.resolvedAt = new Date().toISOString();
  writeJSON(PREDICTIONS_FILE, preds);
  return pred;
}

// --- Votes ---
function getVote(predictionId, userId) {
  const votes = readJSON(VOTES_FILE);
  const key = `${predictionId}_${userId}`;
  return votes[key] || null;
}

function getUserVotes(userId) {
  const votes = readJSON(VOTES_FILE);
  const userVotes = {};
  for (const [key, vote] of Object.entries(votes)) {
    if (vote.userId === userId) {
      userVotes[vote.predictionId] = vote;
    }
  }
  return userVotes;
}

function addVote(predictionId, userId, choice) {
  const votes = readJSON(VOTES_FILE);
  const key = `${predictionId}_${userId}`;
  if (votes[key]) return null; // already voted

  votes[key] = {
    predictionId,
    userId,
    choice,
    votedAt: new Date().toISOString()
  };
  writeJSON(VOTES_FILE, votes);

  // Update prediction vote count
  const preds = readJSON(PREDICTIONS_FILE);
  const pred = preds.find(p => p.id === predictionId);
  if (pred) {
    if (choice === 'A') pred.votesA++;
    else pred.votesB++;
    writeJSON(PREDICTIONS_FILE, preds);
  }

  return votes[key];
}

ensureFiles();

module.exports = {
  getUser, createOrUpdateUser, getAllUsers, getLeaderboard,
  getPredictions, getActivePredictions, getPrediction, addPrediction, resolvePrediction,
  getVote, getUserVotes, addVote
};
