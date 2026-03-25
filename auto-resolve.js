const db = require('./db');

// ============================================
// PREDICT KING - AUTO-RESOLVE ENGINE
// ============================================

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
let bot = null;

function setBot(botInstance) {
  bot = botInstance;
}

// --- SEND NOTIFICATION TO USER ---
async function notifyUser(userId, message) {
  if (!bot) return;
  try {
    const user = await db.getUser(userId);
    if (user?.chatId) {
      await bot.sendMessage(user.chatId, message, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    // User may have blocked the bot, ignore
  }
}

// --- RESOLVE EXPIRED OPINION PREDICTIONS ---
async function resolveByMajority() {
  const preds = await db.getPredictions();
  const now = new Date();
  let resolved = 0;

  for (const pred of preds) {
    if (pred.resolved) continue;
    if (new Date(pred.expiresAt) > now) continue;

    // No votes? Mark as resolved with no winner (free the slot)
    if (pred.votesA + pred.votesB === 0) {
      await db.resolvePrediction(pred.id, 'A');
      resolved++;
      console.log(`Expired with 0 votes: "${pred.question}" (slot freed)`);
      continue;
    }

    const result = pred.votesA >= pred.votesB ? 'A' : 'B';
    await db.resolvePrediction(pred.id, result);
    await awardPoints(pred.id, result, pred);
    resolved++;

    const winner = result === 'A' ? pred.optionA : pred.optionB;
    console.log(`Resolved "${pred.question}" -> ${winner} (majority vote)`);
  }

  if (resolved > 0) console.log(`Resolved ${resolved} predictions by majority vote`);
  return resolved;
}

// --- RESOLVE CRYPTO PREDICTIONS BY PRICE ---
async function resolveCryptoPredictions() {
  const preds = await db.getPredictions();
  const now = new Date();
  let resolved = 0;

  const cryptoPreds = preds.filter(p =>
    !p.resolved &&
    p.category === 'crypto' &&
    new Date(p.expiresAt) <= now &&
    p.question.match(/above \$[\d,]+/)
  );

  if (cryptoPreds.length === 0) return 0;

  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,ripple,cardano,avalanche-2,pepe&vs_currencies=usd';
    const res = await fetch(url);
    const data = await res.json();

    const coinMap = {
      'BTC': 'bitcoin', 'Bitcoin': 'bitcoin',
      'ETH': 'ethereum', 'Ethereum': 'ethereum',
      'SOL': 'solana', 'Solana': 'solana',
      'DOGE': 'dogecoin', 'Dogecoin': 'dogecoin',
      'XRP': 'ripple',
      'ADA': 'cardano', 'Cardano': 'cardano',
      'AVAX': 'avalanche-2', 'Avalanche': 'avalanche-2',
      'PEPE': 'pepe'
    };

    for (const pred of cryptoPreds) {
      const match = pred.question.match(/(\w+) above \$([\d,]+)/);
      if (!match) continue;

      const coinName = match[1];
      const target = parseFloat(match[2].replace(/,/g, ''));
      const coinId = coinMap[coinName];

      if (!coinId || !data[coinId]) continue;

      const currentPrice = data[coinId].usd;
      const result = currentPrice > target ? 'A' : 'B';

      await db.resolvePrediction(pred.id, result);
      await awardPoints(pred.id, result, pred);
      resolved++;

      console.log(`Resolved "${pred.question}" -> ${result === 'A' ? 'YES' : 'NO'} (price: $${currentPrice})`);
    }
  } catch (e) {
    console.error('Crypto resolve error:', e.message);
  }

  return resolved;
}

// --- RESOLVE SPORT PREDICTIONS ---
async function resolveSportPredictions() {
  const preds = await db.getPredictions();
  const now = new Date();
  let resolved = 0;

  const sportPreds = preds.filter(p =>
    !p.resolved &&
    ['football', 'nba', 'nfl', 'hockey', 'rugby'].includes(p.category) &&
    new Date(p.expiresAt) <= now &&
    p.question.includes('vs') &&
    p.question.includes('Who wins')
  );

  for (const pred of sportPreds) {
    if (pred.votesA + pred.votesB === 0) continue;

    const result = pred.votesA >= pred.votesB ? 'A' : 'B';
    await db.resolvePrediction(pred.id, result);
    await awardPoints(pred.id, result, pred);
    resolved++;

    const winner = result === 'A' ? pred.optionA : pred.optionB;
    console.log(`Resolved "${pred.question}" -> ${winner} (majority)`);
  }

  return resolved;
}

// --- AWARD POINTS TO WINNERS + NOTIFY ---
async function awardPoints(predictionId, result, prediction) {
  const allUsers = await db.getAllUsers();
  const winnerChoice = result === 'A' ? prediction.optionA : prediction.optionB;

  for (const userId of Object.keys(allUsers)) {
    const vote = await db.getVote(predictionId, userId);
    if (!vote) continue;

    const user = allUsers[userId];

    if (vote.choice === result) {
      const newStreak = (user.streak || 0) + 1;
      const streakBonus = Math.min(newStreak * 5, 50);
      const totalPoints = 10 + streakBonus;
      await db.createOrUpdateUser(userId, {
        ...user,
        points: (user.points || 0) + totalPoints,
        streak: newStreak,
        bestStreak: Math.max(newStreak, user.bestStreak || 0),
        correctPredictions: (user.correctPredictions || 0) + 1
      });

      // Notify winner
      await notifyUser(userId,
        `*YOU WERE RIGHT!* +${totalPoints} pts\n\n"${prediction.question}"\nAnswer: *${winnerChoice}*\n\nStreak: ${newStreak} | Points: ${(user.points || 0) + totalPoints}\n\n[Keep playing!](https://t.me/PredictKingAppBot)`
      );
    } else {
      await db.createOrUpdateUser(userId, { ...user, streak: 0 });

      // Notify loser (motivational)
      await notifyUser(userId,
        `*Wrong this time!* Streak reset\n\n"${prediction.question}"\nAnswer: *${winnerChoice}*\n\nCome back and rebuild your streak!\n\n[Play again](https://t.me/PredictKingAppBot)`
      );
    }
  }
}

// --- MAIN RESOLVER ---
async function resolveAll() {
  console.log('\nChecking predictions to resolve...');

  const crypto = await resolveCryptoPredictions();
  const sports = await resolveSportPredictions();
  const opinions = await resolveByMajority();

  const total = crypto + sports + opinions;
  if (total > 0) {
    console.log(`Total resolved: ${total} (crypto: ${crypto}, sports: ${sports}, opinions: ${opinions})\n`);
  }

  return total;
}

// --- SCHEDULER (every 30 min for faster turnover) ---
function startResolveScheduler() {
  console.log('Auto-resolve scheduler started (every 30 min)');

  setInterval(() => {
    resolveAll();
  }, 30 * 60 * 1000);

  setTimeout(() => {
    resolveAll();
  }, 10000);
}

module.exports = { resolveAll, startResolveScheduler, setBot };
