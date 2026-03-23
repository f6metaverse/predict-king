const db = require('./db');

// ============================================
// PREDICT KING — AUTO-GENERATION ENGINE
// ============================================
// Generates fresh predictions daily from:
// 1. Live sports data (API-Football, API-Sports)
// 2. Live crypto data (CoinGecko)
// 3. Curated trending templates (music, gaming, cinema, drama)
// 4. Google Trends / News API for hot topics
// ============================================

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';

// --- CRYPTO PREDICTIONS ---
async function generateCryptoPredictions() {
  const predictions = [];

  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,ripple,cardano&vs_currencies=usd&include_24hr_change=true';
    const headers = COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {};
    const res = await fetch(url, { headers });
    const data = await res.json();

    const coins = [
      { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', emoji: '₿' },
      { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', emoji: '💎' },
      { id: 'solana', name: 'Solana', symbol: 'SOL', emoji: '⚡' },
      { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', emoji: '🐕' },
      { id: 'ripple', name: 'XRP', symbol: 'XRP', emoji: '💧' },
      { id: 'cardano', name: 'Cardano', symbol: 'ADA', emoji: '🔷' }
    ];

    for (const coin of coins) {
      if (!data[coin.id]) continue;
      const price = Math.round(data[coin.id].usd);
      const change = data[coin.id].usd_24h_change;

      // Round target based on coin price
      let target;
      if (price > 10000) target = Math.round(price / 1000) * 1000 + (change > 0 ? 5000 : -2000);
      else if (price > 100) target = Math.round(price / 100) * 100 + (change > 0 ? 200 : -100);
      else if (price > 1) target = Math.round(price * 1.1);
      else target = (price * 1.15).toFixed(3);

      const templates = [
        {
          question: `${coin.name} au-dessus de $${target.toLocaleString()} ce weekend ?`,
          optionA: 'OUI',
          optionB: 'NON'
        },
        {
          question: `${coin.symbol} va monter ou descendre dans les 24h ?`,
          optionA: '📈 Monte',
          optionB: '📉 Descend'
        },
        {
          question: `${coin.name} va surperformer ${coins[Math.floor(Math.random() * coins.length)].name} cette semaine ?`,
          optionA: 'OUI',
          optionB: 'NON'
        }
      ];

      // Pick 1 random template per coin
      const tmpl = templates[Math.floor(Math.random() * templates.length)];
      predictions.push({
        ...tmpl,
        category: 'crypto',
        emoji: coin.emoji,
        expiresAt: new Date(Date.now() + randomHours(24, 72) * 60 * 60 * 1000).toISOString()
      });
    }
  } catch (e) {
    console.error('Crypto API error:', e.message);
    // Fallback predictions
    predictions.push(...getCryptoFallbacks());
  }

  return pickRandom(predictions, 3);
}

function getCryptoFallbacks() {
  return [
    { question: 'Bitcoin va atteindre un nouveau ATH ce mois ?', optionA: 'OUI', optionB: 'NON', category: 'crypto', emoji: '₿', expiresAt: expires(48) },
    { question: 'Ethereum va flipper Solana en volume cette semaine ?', optionA: 'ETH', optionB: 'SOL', category: 'crypto', emoji: '💎', expiresAt: expires(72) },
    { question: 'Un memecoin va faire x10 cette semaine ?', optionA: 'OUI', optionB: 'NON', category: 'crypto', emoji: '🐸', expiresAt: expires(96) },
    { question: 'Le marche crypto va etre vert ou rouge demain ?', optionA: '🟢 Vert', optionB: '🔴 Rouge', category: 'crypto', emoji: '📊', expiresAt: expires(24) },
  ];
}

// --- FOOTBALL PREDICTIONS ---
async function generateFootballPredictions() {
  const predictions = [];

  try {
    if (!FOOTBALL_API_KEY) throw new Error('No API key');

    // Get today's and tomorrow's matches from top leagues
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Top leagues: Premier League, La Liga, Ligue 1, Serie A, Champions League, Bundesliga
    const leagues = [39, 140, 61, 135, 2, 78];
    const leagueId = leagues[Math.floor(Math.random() * leagues.length)];

    const url = `https://v3.football.api-sports.io/fixtures?date=${today}&league=${leagueId}&season=2025`;
    const res = await fetch(url, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response && data.response.length > 0) {
      for (const match of data.response.slice(0, 5)) {
        const home = match.teams.home.name;
        const away = match.teams.away.name;
        const league = match.league.name;

        const templates = [
          { question: `${league} : ${home} vs ${away}, qui gagne ?`, optionA: home, optionB: away },
          { question: `${home} vs ${away} : plus de 2.5 buts ?`, optionA: 'OUI', optionB: 'NON' },
          { question: `${home} va garder sa cage inviolee contre ${away} ?`, optionA: 'OUI', optionB: 'NON' },
        ];

        const tmpl = templates[Math.floor(Math.random() * templates.length)];
        predictions.push({
          ...tmpl,
          category: 'football',
          emoji: '⚽',
          expiresAt: expires(24)
        });
      }
    }
  } catch (e) {
    console.error('Football API error:', e.message);
    predictions.push(...getFootballFallbacks());
  }

  if (predictions.length === 0) predictions.push(...getFootballFallbacks());
  return pickRandom(predictions, 3);
}

function getFootballFallbacks() {
  const pools = [
    { question: 'Le PSG va gagner la Ligue 1 cette saison ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Mbappe va marquer ce weekend ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Qui ira le plus loin en Champions League ?', optionA: 'Real Madrid', optionB: 'Man City' },
    { question: 'Plus de 3 buts dans le prochain Clasico ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Un club francais en demi-finale de LDC ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Vinicius Jr Ballon d\'Or 2026 ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Quel est le meilleur championnat au monde ?', optionA: 'Premier League', optionB: 'La Liga' },
    { question: 'Un transfert a plus de 150M cet ete ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'L\'OM va finir sur le podium en Ligue 1 ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Arsenal va enfin gagner la Premier League ?', optionA: 'OUI', optionB: 'NON' },
  ];
  return pools.map(p => ({ ...p, category: 'football', emoji: '⚽', expiresAt: expires(48) }));
}

// --- NBA PREDICTIONS ---
function generateNBAPredictions() {
  const pools = [
    { question: 'Wembanyama va etre elu MVP cette saison ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'LeBron James va prendre sa retraite en 2026 ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Qui va gagner le titre NBA ?', optionA: 'Celtics', optionB: 'Nuggets' },
    { question: 'Stephen Curry va depasser le record de 3-points en un match ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Wemby ou Luka, qui aura les meilleures stats ce mois ?', optionA: 'Wemby', optionB: 'Luka' },
    { question: 'Un joueur va mettre 60+ points cette semaine ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Lakers en playoffs cette annee ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Le All-Star Game va depasser 400 points combines ?', optionA: 'OUI', optionB: 'NON' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'nba', emoji: '🏀', expiresAt: expires(48) })), 2);
}

// --- UFC / COMBAT ---
function generateCombatPredictions() {
  const pools = [
    { question: 'Le main event UFC ce weekend va finir par KO ?', optionA: 'KO/TKO', optionB: 'Decision' },
    { question: 'Conor McGregor va vraiment revenir combattre ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Jake Paul va perdre son prochain combat ?', optionA: 'Il perd', optionB: 'Il gagne' },
    { question: 'Le prochain champion UFC sera africain ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Un combat va durer moins de 30 secondes ce mois ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Tyson Fury va revenir sur le ring ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Le prochain gros combat de boxe : KO ou decision ?', optionA: 'KO', optionB: 'Decision' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'combat', emoji: '🥊', expiresAt: expires(72) })), 1);
}

// --- F1 ---
function generateF1Predictions() {
  const pools = [
    { question: 'Verstappen va gagner le prochain Grand Prix ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Hamilton va regretter Ferrari avant la fin de saison ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Leclerc va gagner a Monaco ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Plus de 3 abandons au prochain GP ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Red Bull ou Ferrari, qui finit devant au championnat ?', optionA: 'Red Bull', optionB: 'Ferrari' },
    { question: 'Un Safety Car dans le prochain GP ?', optionA: 'OUI', optionB: 'NON' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'f1', emoji: '🏎️', expiresAt: expires(72) })), 1);
}

// --- MUSIQUE ---
function generateMusiquePredictions() {
  const pools = [
    { question: 'Qui va avoir le plus de streams cette semaine ?', optionA: 'Drake', optionB: 'Kendrick Lamar' },
    { question: 'Ninho ou Jul, qui drop le meilleur album en 2026 ?', optionA: 'Ninho', optionB: 'Jul' },
    { question: 'Le prochain feat Aya Nakamura va depasser 100M streams ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Central Cee ou Russ Millions, plus gros artiste UK ?', optionA: 'Central Cee', optionB: 'Russ Millions' },
    { question: 'SDM va sortir un album cette annee ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Travis Scott va annoncer une tournee en France ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Le prochain numero 1 des charts sera du rap ou de la pop ?', optionA: 'Rap', optionB: 'Pop' },
    { question: 'Gazo ou Tiakola, qui aura le plus gros mois ?', optionA: 'Gazo', optionB: 'Tiakola' },
    { question: 'Un artiste francais va feat avec Drake en 2026 ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Beyonce va drop un nouvel album avant l\'ete ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Le plus gros concert en France en 2026 ?', optionA: 'Stade de France', optionB: 'La Defense Arena' },
    { question: 'Werenoi va depasser Ninho en streams mensuels ?', optionA: 'OUI', optionB: 'NON' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'musique', emoji: '🎵', expiresAt: expires(96) })), 2);
}

// --- GAMING ---
function generateGamingPredictions() {
  const pools = [
    { question: 'GTA 6 va sortir a la date prevue ?', optionA: 'A l\'heure', optionB: 'Reporte' },
    { question: 'Quel jeu va etre le plus vendu en 2026 ?', optionA: 'GTA 6', optionB: 'Autre' },
    { question: 'PS5 Pro va dépasser les ventes Xbox ?', optionA: 'PS5 Pro', optionB: 'Xbox' },
    { question: 'Fortnite va sortir un event plus gros que le concert Travis Scott ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Nintendo va annoncer une nouvelle console ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'La France va gagner un tournoi esport majeur ce mois ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Le prochain Call of Duty sera le meilleur de la serie ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'EA FC 26 va etre mieux que le 25 ?', optionA: 'Mieux', optionB: 'Pire' },
    { question: 'Un jeu free-to-play va battre un record de joueurs ce mois ?', optionA: 'OUI', optionB: 'NON' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'gaming', emoji: '🎮', expiresAt: expires(96) })), 1);
}

// --- CINEMA & SERIES ---
function generateCinemaPredictions() {
  const pools = [
    { question: 'Le prochain Marvel va depasser 1 milliard au box-office ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Marvel ou DC, meilleur film en 2026 ?', optionA: 'Marvel', optionB: 'DC' },
    { question: 'Squid Game S3 va battre le record de vues de la S1 ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Netflix ou Disney+, plus de hits cette annee ?', optionA: 'Netflix', optionB: 'Disney+' },
    { question: 'Le prochain film le plus vu au cinema en France sera une comedie ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Un anime va etre le film le plus vu au monde ce mois ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'La prochaine grosse serie Netflix sera meilleure que Wednesday ?', optionA: 'Meilleure', optionB: 'Pire' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'cinema', emoji: '🎬', expiresAt: expires(96) })), 1);
}

// --- DRAMA & BUZZ ---
function generateDramaPredictions() {
  const pools = [
    { question: 'Elon Musk va encore faire polemique cette semaine ?', optionA: 'OUI (evidemment)', optionB: 'NON (miracle)' },
    { question: 'IShowSpeed va depasser 50M d\'abonnes YouTube ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'MrBeast va sortir une video a plus de 200M vues ce mois ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Un gros YouTuber va se faire cancel cette semaine ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'L\'IA va remplacer un metier majeur d\'ici fin 2026 ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Un nouveau pays va legaliser le Bitcoin cette annee ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Apple va annoncer un produit revolutionnaire en 2026 ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Le prochain buzz mondial sera positif ou negatif ?', optionA: 'Positif', optionB: 'Negatif' },
    { question: 'Squeezie va depasser Pewdiepie en abonnes ?', optionA: 'OUI', optionB: 'NON' },
    { question: 'Un influenceur va se lancer en politique cette annee ?', optionA: 'OUI', optionB: 'NON' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'drama', emoji: '👀', expiresAt: expires(72) })), 1);
}

// --- NEWS-BASED PREDICTIONS ---
async function generateNewsPredictions() {
  const predictions = [];

  try {
    if (!NEWS_API_KEY) throw new Error('No NEWS API key');

    const url = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&language=fr&category=top`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      // Take top 3 headlines and create predictions around them
      for (const article of data.results.slice(0, 3)) {
        if (article.title && article.title.length > 10) {
          predictions.push({
            question: `"${article.title.slice(0, 80)}..." — ca va changer quelque chose ?`,
            optionA: 'OUI impact',
            optionB: 'NON oublie',
            category: 'trending',
            emoji: '🔥',
            expiresAt: expires(48)
          });
        }
      }
    }
  } catch (e) {
    console.error('News API error:', e.message);
  }

  if (predictions.length === 0) {
    predictions.push(...getTrendingFallbacks());
  }

  return pickRandom(predictions, 1);
}

function getTrendingFallbacks() {
  return [
    { question: 'Le sujet le plus chaud cette semaine sera lie a la politique ?', optionA: 'Politique', optionB: 'Autre', category: 'trending', emoji: '🔥', expiresAt: expires(48) },
    { question: 'Une news va casser Internet cette semaine ?', optionA: 'OUI', optionB: 'NON', category: 'trending', emoji: '🔥', expiresAt: expires(72) },
  ];
}

// ============================================
// MAIN GENERATOR — Runs daily
// ============================================
async function generateDailyPredictions() {
  console.log('\n🔮 Generating daily predictions...');

  const results = await Promise.allSettled([
    generateCryptoPredictions(),
    generateFootballPredictions(),
    generateNBAPredictions(),
    generateCombatPredictions(),
    generateF1Predictions(),
    generateMusiquePredictions(),
    generateGamingPredictions(),
    generateCinemaPredictions(),
    generateDramaPredictions(),
    generateNewsPredictions()
  ]);

  let total = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const pred of result.value) {
        // Check for duplicates (same question)
        const existing = db.getActivePredictions();
        const isDupe = existing.some(e =>
          e.question.toLowerCase().includes(pred.question.toLowerCase().slice(0, 30))
        );
        if (!isDupe) {
          db.addPrediction(pred);
          total++;
        }
      }
    } else {
      console.error('Generator failed:', result.reason);
    }
  }

  console.log(`✅ Generated ${total} new predictions\n`);
  return total;
}

// Clean up expired predictions (keep resolved ones for history)
function cleanupExpired() {
  const preds = db.getPredictions();
  const now = new Date();
  let cleaned = 0;

  const active = preds.filter(p => {
    if (!p.resolved && new Date(p.expiresAt) < now) {
      cleaned++;
      return false;
    }
    return true;
  });

  if (cleaned > 0) {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(__dirname, 'data', 'predictions.json'), JSON.stringify(active, null, 2));
    console.log(`🧹 Cleaned ${cleaned} expired predictions`);
  }
}

// ============================================
// SCHEDULER — Runs every 8 hours
// ============================================
function startScheduler() {
  console.log('⏰ Prediction scheduler started');

  // Generate on startup if no active predictions
  const active = db.getActivePredictions();
  if (active.length < 5) {
    generateDailyPredictions();
  }

  // Run every 8 hours
  setInterval(async () => {
    cleanupExpired();
    const active = db.getActivePredictions();
    if (active.length < 8) {
      await generateDailyPredictions();
    }
  }, 8 * 60 * 60 * 1000);

  // Cleanup every hour
  setInterval(() => {
    cleanupExpired();
  }, 60 * 60 * 1000);
}

// ============================================
// HELPERS
// ============================================
function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomHours(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function expires(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

module.exports = { generateDailyPredictions, cleanupExpired, startScheduler };
