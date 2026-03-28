const db = require('./db');

// ============================================
// PREDICT KING - AUTO-RESOLVE ENGINE v2
// Real results from APIs, not majority vote
// ============================================

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
let bot = null;

// Ghost match blacklist — matches that returned NS/PST/CANC after kickoff
// Once blacklisted, we NEVER call the API again for these IDs (saves quota)
// They get cleaned up by the majority vote fallback after MAX_RESOLVE_HOURS
const ghostMatches = new Set();

function setBot(botInstance) {
  bot = botInstance;
}

// --- SMART DELAY: only check after match is likely finished ---
// Matches expire 5 min BEFORE kickoff, but the game still needs to be played!
// This avoids spamming the API during the match.
const SPORT_DURATION_HOURS = {
  football: 2.5,   // 90min + halftime + extra time buffer
  basketball: 3,   // ~2.5h + overtime buffer
  hockey: 3,       // ~2.5h + overtime/shootout
  'american-football': 4, // ~3.5h + overtime
  rugby: 2.5,      // 80min + halftime + buffer
  mma: 5,          // full card can last 4-5h
};

// Max hours to keep retrying before falling back to majority vote
const MAX_RESOLVE_HOURS = 8;

function isReadyToResolve(pred) {
  const now = new Date();
  const expiresAt = new Date(pred.expiresAt);

  // Not expired yet — don't touch
  if (expiresAt > now) return false;

  // Get sport type and match duration
  const apiType = pred.metadata?.apiType || '';
  const duration = SPORT_DURATION_HOURS[apiType] || 3;

  // Kickoff is ~5 min after expiry (we expire 5 min before kickoff)
  const kickoff = new Date(expiresAt.getTime() + 5 * 60 * 1000);
  const earliestResolve = new Date(kickoff.getTime() + duration * 3600000);

  // Don't check until the match is likely finished
  return now >= earliestResolve;
}

function hasExceededMaxRetries(pred) {
  const now = new Date();
  const expiresAt = new Date(pred.expiresAt);
  const hoursSinceExpiry = (now - expiresAt) / 3600000;
  const apiType = pred.metadata?.apiType || '';
  const duration = SPORT_DURATION_HOURS[apiType] || 3;
  return hoursSinceExpiry > (duration + MAX_RESOLVE_HOURS);
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

// ============================================
// RESOLVE FOOTBALL BY REAL SCORES
// ============================================
async function resolveFootball() {
  const preds = await db.getPredictions();
  const now = new Date();
  let resolved = 0;

  const footballPreds = preds.filter(p =>
    !p.resolved &&
    p.category === 'football' &&
    p.metadata?.apiType === 'football' &&
    p.metadata?.fixtureId &&
    isReadyToResolve(p)
  );

  if (footballPreds.length === 0) return 0;
  if (!FOOTBALL_API_KEY) return resolveByMajority(footballPreds);

  // Group by fixture ID to minimize API calls
  const fixtureIds = [...new Set(footballPreds.map(p => p.metadata.fixtureId))];

  for (const fixtureId of fixtureIds) {
    // Skip ghost matches entirely — 0 API calls
    if (ghostMatches.has(`football-${fixtureId}`)) continue;

    try {
      const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, {
        headers: { 'x-apisports-key': FOOTBALL_API_KEY }
      });
      const data = await res.json();
      const fixture = data.response?.[0];

      if (!fixture) continue;

      const status = fixture.fixture?.status?.short;
      // Still "Not Started" hours after kickoff = ghost match, blacklist forever
      if (status === 'NS' || status === 'TBD' || status === 'PST' || status === 'CANC') {
        ghostMatches.add(`football-${fixtureId}`);
        console.log(`👻 Football #${fixtureId}: status ${status} — blacklisted (0 future API calls)`);
        continue;
      }
      // FT = Full Time, AET = After Extra Time, PEN = Penalties
      if (!['FT', 'AET', 'PEN'].includes(status)) continue;

      const goalsHome = fixture.goals?.home ?? 0;
      const goalsAway = fixture.goals?.away ?? 0;
      const totalGoals = goalsHome + goalsAway;

      // Resolve all predictions for this fixture
      const fixturePreds = footballPreds.filter(p => p.metadata.fixtureId === fixtureId);
      for (const pred of fixturePreds) {
        let result = null;

        switch (pred.metadata.predType) {
          case 'winner':
            if (goalsHome > goalsAway) {
              // Home team won — if optionA is home team, result is A
              result = pred.optionA === pred.metadata.homeTeam ? 'A' : 'B';
            } else if (goalsAway > goalsHome) {
              result = pred.optionA === pred.metadata.awayTeam ? 'A' : 'B';
            } else {
              // Draw — resolve by majority since we don't offer draw option
              result = pred.votesA >= pred.votesB ? 'A' : 'B';
            }
            break;

          case 'over_goals':
            result = totalGoals > (pred.metadata.threshold || 2.5) ? 'A' : 'B';
            break;

          case 'clean_sheet':
            if (pred.metadata.teamRef === 'home') {
              result = goalsAway === 0 ? 'A' : 'B';
            } else {
              result = goalsHome === 0 ? 'A' : 'B';
            }
            break;

          default:
            result = pred.votesA >= pred.votesB ? 'A' : 'B';
        }

        if (result) {
          await db.resolvePrediction(pred.id, result);
          await awardPoints(pred.id, result, pred);
          resolved++;
          const winner = result === 'A' ? pred.optionA : pred.optionB;
          console.log(`✅ Football resolved: "${pred.question}" → ${winner} (Score: ${goalsHome}-${goalsAway})`);
        }
      }
    } catch (e) {
      console.error(`Football resolve error (fixture ${fixtureId}):`, e.message);
    }
  }

  return resolved;
}

// ============================================
// RESOLVE NBA/BASKETBALL BY REAL SCORES
// ============================================
async function resolveBasketball() {
  const preds = await db.getPredictions();
  const now = new Date();
  let resolved = 0;

  const nbaPreds = preds.filter(p =>
    !p.resolved &&
    p.category === 'nba' &&
    p.metadata?.apiType === 'basketball' &&
    p.metadata?.gameId &&
    isReadyToResolve(p)
  );

  if (nbaPreds.length === 0) return 0;
  if (!FOOTBALL_API_KEY) return resolveByMajority(nbaPreds);

  const gameIds = [...new Set(nbaPreds.map(p => p.metadata.gameId))];

  for (const gameId of gameIds) {
    if (ghostMatches.has(`nba-${gameId}`)) continue;

    try {
      const res = await fetch(`https://v1.basketball.api-sports.io/games?id=${gameId}`, {
        headers: { 'x-apisports-key': FOOTBALL_API_KEY }
      });
      const data = await res.json();
      const game = data.response?.[0];

      if (!game) continue;

      const status = game.status?.short;
      if (status === 'NS' || status === 'PST' || status === 'CANC') {
        ghostMatches.add(`nba-${gameId}`);
        console.log(`👻 NBA #${gameId}: status ${status} — blacklisted`);
        continue;
      }
      if (!['FT', 'AOT'].includes(status)) continue;

      const scoreHome = game.scores?.home?.total ?? 0;
      const scoreAway = game.scores?.away?.total ?? 0;
      const totalPoints = scoreHome + scoreAway;

      const gamePreds = nbaPreds.filter(p => p.metadata.gameId === gameId);
      for (const pred of gamePreds) {
        let result = null;

        switch (pred.metadata.predType) {
          case 'winner':
            if (scoreHome > scoreAway) {
              result = pred.optionA === pred.metadata.homeTeam ? 'A' : 'B';
            } else {
              result = pred.optionA === pred.metadata.awayTeam ? 'A' : 'B';
            }
            break;

          case 'over_points':
            result = totalPoints > (pred.metadata.threshold || 220) ? 'A' : 'B';
            break;

          default:
            result = pred.votesA >= pred.votesB ? 'A' : 'B';
        }

        if (result) {
          await db.resolvePrediction(pred.id, result);
          await awardPoints(pred.id, result, pred);
          resolved++;
          const winner = result === 'A' ? pred.optionA : pred.optionB;
          console.log(`✅ NBA resolved: "${pred.question}" → ${winner} (Score: ${scoreHome}-${scoreAway})`);
        }
      }
    } catch (e) {
      console.error(`NBA resolve error (game ${gameId}):`, e.message);
    }
  }

  return resolved;
}

// ============================================
// RESOLVE HOCKEY BY REAL SCORES
// ============================================
async function resolveHockey() {
  const preds = await db.getPredictions();
  const now = new Date();
  let resolved = 0;

  const hockeyPreds = preds.filter(p =>
    !p.resolved &&
    p.category === 'hockey' &&
    p.metadata?.apiType === 'hockey' &&
    p.metadata?.gameId &&
    isReadyToResolve(p)
  );

  if (hockeyPreds.length === 0) return 0;
  if (!FOOTBALL_API_KEY) return resolveByMajority(hockeyPreds);

  const gameIds = [...new Set(hockeyPreds.map(p => p.metadata.gameId))];

  for (const gameId of gameIds) {
    if (ghostMatches.has(`hockey-${gameId}`)) continue;

    try {
      const res = await fetch(`https://v1.hockey.api-sports.io/games?id=${gameId}`, {
        headers: { 'x-apisports-key': FOOTBALL_API_KEY }
      });
      const data = await res.json();
      const game = data.response?.[0];

      if (!game) continue;

      const status = game.status?.short;
      if (status === 'NS' || status === 'PST' || status === 'CANC') {
        ghostMatches.add(`hockey-${gameId}`);
        console.log(`👻 Hockey #${gameId}: status ${status} — blacklisted`);
        continue;
      }
      if (!['FT', 'AOT', 'AP'].includes(status)) continue;

      const scoreHome = game.scores?.home ?? 0;
      const scoreAway = game.scores?.away ?? 0;
      const totalGoals = scoreHome + scoreAway;

      const gamePreds = hockeyPreds.filter(p => p.metadata.gameId === gameId);
      for (const pred of gamePreds) {
        let result = null;

        switch (pred.metadata.predType) {
          case 'winner':
            if (scoreHome > scoreAway) {
              result = pred.optionA === pred.metadata.homeTeam ? 'A' : 'B';
            } else {
              result = pred.optionA === pred.metadata.awayTeam ? 'A' : 'B';
            }
            break;

          case 'over_goals':
            result = totalGoals > (pred.metadata.threshold || 5.5) ? 'A' : 'B';
            break;

          default:
            result = pred.votesA >= pred.votesB ? 'A' : 'B';
        }

        if (result) {
          await db.resolvePrediction(pred.id, result);
          await awardPoints(pred.id, result, pred);
          resolved++;
          const winner = result === 'A' ? pred.optionA : pred.optionB;
          console.log(`✅ Hockey resolved: "${pred.question}" → ${winner} (Score: ${scoreHome}-${scoreAway})`);
        }
      }
    } catch (e) {
      console.error(`Hockey resolve error (game ${gameId}):`, e.message);
    }
  }

  return resolved;
}

// ============================================
// RESOLVE NFL BY REAL SCORES
// ============================================
async function resolveNFL() {
  const preds = await db.getPredictions();
  const now = new Date();
  let resolved = 0;

  const nflPreds = preds.filter(p =>
    !p.resolved &&
    p.category === 'nfl' &&
    p.metadata?.apiType === 'american-football' &&
    p.metadata?.gameId &&
    isReadyToResolve(p)
  );

  if (nflPreds.length === 0) return 0;
  if (!FOOTBALL_API_KEY) return resolveByMajority(nflPreds);

  const gameIds = [...new Set(nflPreds.map(p => p.metadata.gameId))];

  for (const gameId of gameIds) {
    if (ghostMatches.has(`nfl-${gameId}`)) continue;

    try {
      const res = await fetch(`https://v1.american-football.api-sports.io/games?id=${gameId}`, {
        headers: { 'x-apisports-key': FOOTBALL_API_KEY }
      });
      const data = await res.json();
      const game = data.response?.[0];

      if (!game) continue;

      const status = game.status?.short;
      if (status === 'NS' || status === 'PST' || status === 'CANC') {
        ghostMatches.add(`nfl-${gameId}`);
        console.log(`👻 NFL #${gameId}: status ${status} — blacklisted`);
        continue;
      }
      if (!['FT', 'AOT'].includes(status)) continue;

      const scoreHome = game.scores?.home?.total ?? 0;
      const scoreAway = game.scores?.away?.total ?? 0;

      const gamePreds = nflPreds.filter(p => p.metadata.gameId === gameId);
      for (const pred of gamePreds) {
        let result = null;
        if (scoreHome > scoreAway) {
          result = pred.optionA === pred.metadata.homeTeam ? 'A' : 'B';
        } else {
          result = pred.optionA === pred.metadata.awayTeam ? 'A' : 'B';
        }

        if (result) {
          await db.resolvePrediction(pred.id, result);
          await awardPoints(pred.id, result, pred);
          resolved++;
          const winner = result === 'A' ? pred.optionA : pred.optionB;
          console.log(`✅ NFL resolved: "${pred.question}" → ${winner} (Score: ${scoreHome}-${scoreAway})`);
        }
      }
    } catch (e) {
      console.error(`NFL resolve error (game ${gameId}):`, e.message);
    }
  }

  return resolved;
}

// ============================================
// RESOLVE RUGBY BY REAL SCORES
// ============================================
async function resolveRugby() {
  const preds = await db.getPredictions();
  const now = new Date();
  let resolved = 0;

  const rugbyPreds = preds.filter(p =>
    !p.resolved &&
    p.category === 'rugby' &&
    p.metadata?.apiType === 'rugby' &&
    p.metadata?.gameId &&
    isReadyToResolve(p)
  );

  if (rugbyPreds.length === 0) return 0;
  if (!FOOTBALL_API_KEY) return resolveByMajority(rugbyPreds);

  const gameIds = [...new Set(rugbyPreds.map(p => p.metadata.gameId))];

  for (const gameId of gameIds) {
    if (ghostMatches.has(`rugby-${gameId}`)) continue;

    try {
      const res = await fetch(`https://v1.rugby.api-sports.io/games?id=${gameId}`, {
        headers: { 'x-apisports-key': FOOTBALL_API_KEY }
      });
      const data = await res.json();
      const game = data.response?.[0];

      if (!game) continue;

      const status = game.status?.short;
      if (status === 'NS' || status === 'PST' || status === 'CANC') {
        ghostMatches.add(`rugby-${gameId}`);
        console.log(`👻 Rugby #${gameId}: status ${status} — blacklisted`);
        continue;
      }
      if (status !== 'FT') continue;

      const scoreHome = game.scores?.home ?? 0;
      const scoreAway = game.scores?.away ?? 0;

      const gamePreds = rugbyPreds.filter(p => p.metadata.gameId === gameId);
      for (const pred of gamePreds) {
        let result;
        if (scoreHome > scoreAway) {
          result = pred.optionA === pred.metadata.homeTeam ? 'A' : 'B';
        } else if (scoreAway > scoreHome) {
          result = pred.optionA === pred.metadata.awayTeam ? 'A' : 'B';
        } else {
          result = pred.votesA >= pred.votesB ? 'A' : 'B';
        }

        await db.resolvePrediction(pred.id, result);
        await awardPoints(pred.id, result, pred);
        resolved++;
        const winner = result === 'A' ? pred.optionA : pred.optionB;
        console.log(`✅ Rugby resolved: "${pred.question}" → ${winner} (Score: ${scoreHome}-${scoreAway})`);
      }
    } catch (e) {
      console.error(`Rugby resolve error (game ${gameId}):`, e.message);
    }
  }

  return resolved;
}

// ============================================
// RESOLVE CRYPTO BY REAL PRICE (CoinGecko)
// ============================================
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

      console.log(`✅ Crypto resolved: "${pred.question}" → ${result === 'A' ? 'YES' : 'NO'} (price: $${currentPrice})`);
    }
  } catch (e) {
    console.error('Crypto resolve error:', e.message);
  }

  return resolved;
}

// ============================================
// RESOLVE OPINION/NEWS PREDICTIONS (majority vote — only for non-sport)
// ============================================
async function resolveByMajority(predsToResolve) {
  let resolved = 0;

  // If called with specific preds, resolve those
  // Otherwise find all expired non-sport/non-crypto preds
  let preds = predsToResolve;
  if (!preds) {
    const allPreds = await db.getPredictions();
    const now = new Date();
    preds = allPreds.filter(p =>
      !p.resolved &&
      new Date(p.expiresAt) <= now
    );
  }

  for (const pred of preds) {
    // Skip if it has API metadata and should be resolved by real data later
    if (pred.metadata?.fixtureId || pred.metadata?.gameId || pred.metadata?.fightId) {
      if (!hasExceededMaxRetries(pred)) continue; // Still waiting for real data
      console.log(`⚠️ Fallback majority resolve (max retries exceeded): "${pred.question}"`);
    }

    // No votes? Free the slot
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
    console.log(`📊 Opinion resolved: "${pred.question}" → ${winner} (majority vote)`);
  }

  return resolved;
}

// --- AWARD POINTS TO WINNERS + NOTIFY ---
async function awardPoints(predictionId, result, prediction) {
  const allUsers = await db.getAllUsers();
  const winnerChoice = result === 'A' ? prediction.optionA : prediction.optionB;
  const isRealResult = prediction.metadata?.predType && prediction.metadata?.predType !== 'opinion';

  for (const userId of Object.keys(allUsers)) {
    const vote = await db.getVote(predictionId, userId);
    if (!vote) continue;

    const user = allUsers[userId];

    if (vote.choice === result) {
      const newStreak = (user.streak || 0) + 1;
      const streakBonus = Math.min(newStreak * 5, 50);
      // Real predictions give more points than opinion polls
      const basePoints = isRealResult ? 15 : 10;
      const totalPoints = basePoints + streakBonus;
      await db.createOrUpdateUser(userId, {
        ...user,
        points: (user.points || 0) + totalPoints,
        streak: newStreak,
        bestStreak: Math.max(newStreak, user.bestStreak || 0),
        correctPredictions: (user.correctPredictions || 0) + 1
      });

      const resultEmoji = isRealResult ? '🏆' : '✅';
      await notifyUser(userId,
        `*${resultEmoji} YOU WERE RIGHT!* +${totalPoints} pts\n\n"${prediction.question}"\nAnswer: *${winnerChoice}*\n\nStreak: ${newStreak} | Points: ${(user.points || 0) + totalPoints}\n\n[Keep playing!](https://t.me/PredictKingAppBot)`
      );
    } else {
      await db.createOrUpdateUser(userId, { ...user, streak: 0 });

      await notifyUser(userId,
        `*Wrong this time!* Streak reset\n\n"${prediction.question}"\nAnswer: *${winnerChoice}*\n\nCome back and rebuild your streak!\n\n[Play again](https://t.me/PredictKingAppBot)`
      );
    }
  }
}

// --- MAIN RESOLVER ---
async function resolveAll() {
  console.log('\nChecking predictions to resolve...');

  // Real data resolution (API-Sports + CoinGecko)
  const football = await resolveFootball();
  const basketball = await resolveBasketball();
  const hockey = await resolveHockey();
  const nfl = await resolveNFL();
  const rugby = await resolveRugby();
  const crypto = await resolveCryptoPredictions();

  // Opinion/news resolution (majority vote)
  const opinions = await resolveByMajority();

  const total = football + basketball + hockey + nfl + rugby + crypto + opinions;
  if (total > 0) {
    console.log(`Total resolved: ${total} (football: ${football}, nba: ${basketball}, hockey: ${hockey}, nfl: ${nfl}, rugby: ${rugby}, crypto: ${crypto}, opinions: ${opinions})\n`);
  }

  return total;
}

// --- SCHEDULER (every 30 min) ---
function startResolveScheduler() {
  console.log('Auto-resolve scheduler started (every 30 min, real API results)');

  setInterval(() => {
    resolveAll();
  }, 30 * 60 * 1000);

  setTimeout(() => {
    resolveAll();
  }, 10000);
}

module.exports = { resolveAll, startResolveScheduler, setBot };
