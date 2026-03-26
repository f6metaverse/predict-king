const db = require('./db');

// ============================================
// PREDICT KING - AUTO-GENERATION ENGINE v3
// REAL PREDICTIONS — fetch upcoming events 7 days ahead
// Expiration = event kickoff time
// ============================================

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';

// ============================================
// UTILS
// ============================================

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Get current football season (Aug+ = current year, before Aug = previous year)
function getCurrentSeason() {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

// Generate array of date strings for the next N days
function getNextDays(n) {
  const dates = [];
  for (let i = 0; i <= n; i++) {
    const d = new Date(Date.now() + i * 86400000);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// Format a date nicely for display: "Sat Mar 28, 21:00"
function formatMatchDate(isoDate) {
  const d = new Date(isoDate);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = d.getUTCHours().toString().padStart(2, '0');
  const mins = d.getUTCMinutes().toString().padStart(2, '0');
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${hours}:${mins}`;
}

// Set expiration to 5 minutes before kickoff (close voting before the event)
function expiresAtKickoff(kickoffISO) {
  const kickoff = new Date(kickoffISO);
  return new Date(kickoff.getTime() - 5 * 60 * 1000).toISOString();
}

// Fallback expiration for events without precise kickoff
function expiresInHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// Min active predictions per category
const MIN_SLOTS = {
  crypto: 3,
  football: 3,
  nba: 2,
  combat: 1,
  f1: 2,
  nfl: 1,
  hockey: 2,
  rugby: 1,
  musique: 2,
  gaming: 2,
  cinema: 2,
  drama: 2,
  politics: 2,
  world: 1,
  science: 1,
  health: 1,
  trending: 1,
  debate: 2
};

// ============================================
// ROTATION SYSTEM for API-Sports (quota: 100/day)
// Each sport generator uses 1-2 API calls max
// ============================================
let apiSportsCycleIndex = 0;

const API_SPORTS_ROTATION = [
  ['football', 'nba'],
  ['hockey', 'combat'],
  ['football', 'nfl'],
  ['nba', 'rugby', 'f1'],
  ['football', 'hockey'],
  ['combat', 'nfl', 'f1'],
  ['football', 'nba'],
  ['hockey', 'rugby', 'combat'],
];

// News rotation
let newsCycleIndex = 0;

const NEWS_ROTATION = [
  [
    { category: 'business', q: 'crypto%20OR%20bitcoin%20OR%20ethereum', predCat: 'crypto', emoji: '📰' },
    { category: 'entertainment', q: 'music%20OR%20album%20OR%20rapper%20OR%20singer%20OR%20spotify', predCat: 'musique', emoji: '🎵' },
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥' },
  ],
  [
    { category: 'technology', q: 'gaming%20OR%20playstation%20OR%20xbox%20OR%20GTA%20OR%20fortnite%20OR%20nintendo', predCat: 'gaming', emoji: '🎮' },
    { category: 'politics', q: null, predCat: 'politics', emoji: '🏛' },
    { category: 'world', q: null, predCat: 'world', emoji: '🌍' },
  ],
  [
    { category: 'entertainment', q: 'movie%20OR%20Netflix%20OR%20Disney%20OR%20Marvel%20OR%20series%20OR%20streaming', predCat: 'cinema', emoji: '🎬' },
    { category: 'science', q: null, predCat: 'science', emoji: '🔬' },
    { category: 'business', q: 'crypto%20OR%20bitcoin%20OR%20ethereum%20OR%20blockchain', predCat: 'crypto', emoji: '📰' },
  ],
  [
    { category: 'technology', q: 'AI%20OR%20Elon%20Musk%20OR%20Apple%20OR%20TikTok%20OR%20viral%20OR%20influencer', predCat: 'drama', emoji: '👀' },
    { category: 'health', q: null, predCat: 'health', emoji: '💪' },
    { category: 'entertainment', q: 'celebrity%20OR%20award%20OR%20viral%20OR%20trending', predCat: 'trending', emoji: '🔥' },
  ],
  [
    { category: 'business', q: 'crypto%20OR%20bitcoin%20OR%20solana%20OR%20memecoin', predCat: 'crypto', emoji: '📰' },
    { category: 'entertainment', q: 'concert%20OR%20Grammy%20OR%20rapper%20OR%20kpop%20OR%20album', predCat: 'musique', emoji: '🎵' },
    { category: 'top', q: null, predCat: 'drama', emoji: '👀' },
  ],
  [
    { category: 'technology', q: 'esports%20OR%20Steam%20OR%20gaming%20OR%20VR%20OR%20console', predCat: 'gaming', emoji: '🎮' },
    { category: 'world', q: null, predCat: 'world', emoji: '🌍' },
    { category: 'politics', q: null, predCat: 'politics', emoji: '🏛' },
  ],
  [
    { category: 'entertainment', q: 'box%20office%20OR%20anime%20OR%20series%20OR%20Netflix%20OR%20HBO', predCat: 'cinema', emoji: '🎬' },
    { category: 'technology', q: 'startup%20OR%20viral%20OR%20controversy%20OR%20scandal', predCat: 'drama', emoji: '👀' },
    { category: 'science', q: 'space%20OR%20NASA%20OR%20discovery%20OR%20breakthrough', predCat: 'science', emoji: '🔬' },
  ],
  [
    { category: 'health', q: 'fitness%20OR%20mental%20health%20OR%20diet%20OR%20wellness', predCat: 'health', emoji: '💪' },
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥' },
    { category: 'business', q: 'bitcoin%20OR%20ethereum%20OR%20crypto%20OR%20DeFi', predCat: 'crypto', emoji: '📰' },
  ],
];

// News question formats
const NEWS_FORMATS = [
  { suffix: ' — Will this matter in a week?', a: 'Big impact', b: 'Already forgotten' },
  { suffix: ' — Agree or disagree?', a: 'Agree', b: 'Disagree' },
  { suffix: ' — Good or bad news?', a: 'Good', b: 'Bad' },
  { suffix: ' — Overhyped or underrated?', a: 'Overhyped', b: 'Underrated' },
  { suffix: ' — W or L?', a: 'Massive W', b: 'Huge L' },
  { suffix: ' — Hit or miss?', a: 'Hit', b: 'Miss' },
  { suffix: ' — Real deal or just noise?', a: 'Real deal', b: 'Just noise' },
];

// ============================================
// API-SPORTS GENERATORS
// Weekly fetch: 14 days for leagues, 21 days for events
// Only called on schedule days (Mon/Wed) or emergency
// ============================================

// Top football leagues to prioritize
const TOP_FOOTBALL_LEAGUES = [39, 140, 61, 135, 2, 78, 253, 262, 3, 848, 1, 4, 5];

async function generateFootballLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const dates = getNextDays(13); // 14 days = this week + next week
    const fromDate = dates[0];
    const toDate = dates[dates.length - 1];
    const season = getCurrentSeason();
    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };

    // 1 API call for 14 days of fixtures
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?from=${fromDate}&to=${toDate}&season=${season}`, { headers });
    const data = await res.json();

    if (!data.response) return predictions;

    // Prioritize top leagues, then fill with others
    const topMatches = data.response.filter(m => TOP_FOOTBALL_LEAGUES.includes(m.league?.id));
    const otherMatches = data.response.filter(m => !TOP_FOOTBALL_LEAGUES.includes(m.league?.id));
    const allMatches = [...topMatches, ...otherMatches];

    // Only upcoming matches (not started/finished)
    const upcoming = allMatches.filter(m =>
      m.fixture?.status?.short === 'NS' || m.fixture?.status?.short === 'TBD'
    );

    for (const match of upcoming.slice(0, 12)) {
      const home = match.teams.home.name;
      const away = match.teams.away.name;
      const league = match.league.name;
      const kickoff = match.fixture.date;
      const fixtureId = match.fixture.id;
      const dateStr = formatMatchDate(kickoff);

      const baseMetadata = {
        fixtureId,
        kickoff,
        apiType: 'football',
        homeTeam: home,
        awayTeam: away
      };

      const templates = [
        {
          question: `⚽ ${league}: ${home} vs ${away} — Who wins? (${dateStr})`,
          optionA: home, optionB: away,
          metadata: { ...baseMetadata, predType: 'winner' }
        },
        {
          question: `⚽ ${home} vs ${away}: Over 2.5 goals? (${dateStr})`,
          optionA: 'YES', optionB: 'NO',
          metadata: { ...baseMetadata, predType: 'over_goals', threshold: 2.5 }
        },
        {
          question: `⚽ Clean sheet for ${home} vs ${away}? (${dateStr})`,
          optionA: 'YES', optionB: 'NO',
          metadata: { ...baseMetadata, predType: 'clean_sheet', teamRef: 'home' }
        },
      ];

      predictions.push({
        ...templates[Math.floor(Math.random() * templates.length)],
        category: 'football', emoji: '⚽',
        expiresAt: expiresAtKickoff(kickoff)
      });
    }
  } catch (e) {
    console.error('Football API error:', e.message);
  }
  return pickRandom(predictions, 5);
}

async function generateNBALive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };
    const dates = getNextDays(6); // 7 days ahead

    // Fetch next 7 days of games
    const allGames = [];
    for (const date of dates) {
      try {
        const res = await fetch(`https://v1.basketball.api-sports.io/games?date=${date}`, { headers });
        const data = await res.json();
        if (data.response) {
          const nbaGames = data.response.filter(g =>
            g.league?.name?.includes('NBA') &&
            (g.status?.short === 'NS' || g.status?.short === null)
          );
          allGames.push(...nbaGames);
        }
      } catch (e) {
        console.error(`NBA fetch error for ${date}:`, e.message);
      }
    }

    for (const game of allGames.slice(0, 8)) {
      const home = game.teams.home.name;
      const away = game.teams.away.name;
      const kickoff = game.date || game.time;
      const gameId = game.id;
      const dateStr = kickoff ? formatMatchDate(kickoff) : datesToFetch[0];

      const baseMetadata = {
        gameId,
        kickoff,
        apiType: 'basketball',
        homeTeam: home,
        awayTeam: away
      };

      const templates = [
        {
          question: `🏀 NBA: ${home} vs ${away} — Who wins? (${dateStr})`,
          optionA: home, optionB: away,
          metadata: { ...baseMetadata, predType: 'winner' }
        },
        {
          question: `🏀 ${home} vs ${away}: Over 220 combined points? (${dateStr})`,
          optionA: 'YES', optionB: 'NO',
          metadata: { ...baseMetadata, predType: 'over_points', threshold: 220 }
        },
      ];

      predictions.push({
        ...templates[Math.floor(Math.random() * templates.length)],
        category: 'nba', emoji: '🏀',
        expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(48)
      });
    }
  } catch (e) {
    console.error('NBA API error:', e.message);
  }
  return pickRandom(predictions, 4);
}

async function generateNFLLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };
    const dates = getNextDays(6);

    const allGames = [];
    for (const date of dates) {
      try {
        const res = await fetch(`https://v1.american-football.api-sports.io/games?date=${date}`, { headers });
        const data = await res.json();
        if (data.response) {
          const nflGames = data.response.filter(g =>
            g.league?.name?.includes('NFL') &&
            (g.status?.short === 'NS' || !g.status?.short)
          );
          allGames.push(...nflGames);
        }
      } catch (e) {
        console.error(`NFL fetch error for ${date}:`, e.message);
      }
    }

    for (const game of allGames.slice(0, 4)) {
      const home = game.teams.home.name;
      const away = game.teams.away.name;
      const kickoff = game.date || game.time;
      const gameId = game.id;
      const dateStr = kickoff ? formatMatchDate(kickoff) : 'This week';

      predictions.push({
        question: `🏈 NFL: ${home} vs ${away} — Who wins? (${dateStr})`,
        optionA: home, optionB: away,
        category: 'nfl', emoji: '🏈',
        expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72),
        metadata: {
          gameId, kickoff, apiType: 'american-football',
          homeTeam: home, awayTeam: away, predType: 'winner'
        }
      });
    }
  } catch (e) {
    console.error('NFL API error:', e.message);
  }
  return predictions;
}

async function generateHockeyLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };
    const dates = getNextDays(6);

    const allGames = [];
    for (const date of dates) {
      try {
        const res = await fetch(`https://v1.hockey.api-sports.io/games?date=${date}`, { headers });
        const data = await res.json();
        if (data.response) {
          const nhlGames = data.response.filter(g =>
            g.league?.name?.includes('NHL') &&
            (g.status?.short === 'NS' || !g.status?.short)
          );
          allGames.push(...nhlGames);
        }
      } catch (e) {
        console.error(`Hockey fetch error for ${date}:`, e.message);
      }
    }

    for (const game of allGames.slice(0, 5)) {
      const home = game.teams.home.name;
      const away = game.teams.away.name;
      const kickoff = game.date || game.time;
      const gameId = game.id;
      const dateStr = kickoff ? formatMatchDate(kickoff) : 'This week';

      const baseMetadata = {
        gameId, kickoff, apiType: 'hockey',
        homeTeam: home, awayTeam: away
      };

      const templates = [
        {
          question: `🏒 NHL: ${home} vs ${away} — Who wins? (${dateStr})`,
          optionA: home, optionB: away,
          metadata: { ...baseMetadata, predType: 'winner' }
        },
        {
          question: `🏒 ${home} vs ${away}: Over 5.5 total goals? (${dateStr})`,
          optionA: 'YES', optionB: 'NO',
          metadata: { ...baseMetadata, predType: 'over_goals', threshold: 5.5 }
        },
      ];

      predictions.push({
        ...templates[Math.floor(Math.random() * templates.length)],
        category: 'hockey', emoji: '🏒',
        expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(48)
      });
    }
  } catch (e) {
    console.error('Hockey API error:', e.message);
  }
  return pickRandom(predictions, 3);
}

async function generateCombatLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const res = await fetch('https://v1.mma.api-sports.io/fights?next=15', {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response) {
      for (const fight of data.response.slice(0, 5)) {
        if (!fight.fighters?.first?.name || !fight.fighters?.second?.name) continue;
        const f1 = fight.fighters.first.name;
        const f2 = fight.fighters.second.name;
        const kickoff = fight.date;
        const fightId = fight.id;
        const dateStr = kickoff ? formatMatchDate(kickoff) : 'Coming soon';

        const baseMetadata = {
          fightId, kickoff, apiType: 'mma',
          fighter1: f1, fighter2: f2
        };

        const templates = [
          {
            question: `🥊 ${f1} vs ${f2} — Who wins? (${dateStr})`,
            optionA: f1, optionB: f2,
            metadata: { ...baseMetadata, predType: 'winner' }
          },
          {
            question: `🥊 ${f1} vs ${f2}: KO or Decision? (${dateStr})`,
            optionA: 'KO/TKO', optionB: 'Decision',
            metadata: { ...baseMetadata, predType: 'method' }
          },
        ];

        predictions.push({
          ...templates[Math.floor(Math.random() * templates.length)],
          category: 'combat', emoji: '🥊',
          expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72)
        });
      }
    }
  } catch (e) {
    console.error('MMA API error:', e.message);
  }
  return pickRandom(predictions, 3);
}

async function generateF1Live() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const res = await fetch('https://v1.formula-1.api-sports.io/races?next=8', {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response) {
      for (const race of data.response.slice(0, 3)) {
        const name = race.competition?.name || 'next race';
        const kickoff = race.date;
        const raceId = race.id;
        const dateStr = kickoff ? formatMatchDate(kickoff) : 'This weekend';

        const baseMetadata = {
          raceId, kickoff, apiType: 'formula-1',
          raceName: name
        };

        predictions.push({
          question: `🏎 F1 ${name}: Who takes pole? (${dateStr})`,
          optionA: 'Verstappen', optionB: 'Someone else',
          category: 'f1', emoji: '🏎',
          expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72),
          metadata: { ...baseMetadata, predType: 'pole' }
        });
        predictions.push({
          question: `🏎 F1 ${name}: Safety Car? (${dateStr})`,
          optionA: 'YES', optionB: 'NO',
          category: 'f1', emoji: '🏎',
          expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72),
          metadata: { ...baseMetadata, predType: 'safety_car' }
        });
        predictions.push({
          question: `🏎 F1 ${name}: Who wins the race? (${dateStr})`,
          optionA: 'Verstappen', optionB: 'Norris',
          category: 'f1', emoji: '🏎',
          expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72),
          metadata: { ...baseMetadata, predType: 'race_winner' }
        });
      }
    }
  } catch (e) {
    console.error('F1 API error:', e.message);
  }
  return pickRandom(predictions, 3);
}

async function generateRugbyLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };
    const dates = getNextDays(6);

    const allGames = [];
    for (const date of dates) {
      try {
        const res = await fetch(`https://v1.rugby.api-sports.io/games?date=${date}`, { headers });
        const data = await res.json();
        if (data.response) {
          const games = data.response.filter(g =>
            g.status?.short === 'NS' || !g.status?.short
          );
          allGames.push(...games);
        }
      } catch (e) {
        console.error(`Rugby fetch error for ${date}:`, e.message);
      }
    }

    for (const game of allGames.slice(0, 4)) {
      const home = game.teams.home.name;
      const away = game.teams.away.name;
      const kickoff = game.date || game.time;
      const gameId = game.id;
      const dateStr = kickoff ? formatMatchDate(kickoff) : 'This week';

      predictions.push({
        question: `🏉 Rugby: ${home} vs ${away} — Who wins? (${dateStr})`,
        optionA: home, optionB: away,
        category: 'rugby', emoji: '🏉',
        expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(48),
        metadata: {
          gameId, kickoff, apiType: 'rugby',
          homeTeam: home, awayTeam: away, predType: 'winner'
        }
      });
    }
  } catch (e) {
    console.error('Rugby API error:', e.message);
  }
  return pickRandom(predictions, 2);
}

// Map sport names to their generators
const SPORT_GENERATORS = {
  football: generateFootballLive,
  nba: generateNBALive,
  nfl: generateNFLLive,
  hockey: generateHockeyLive,
  combat: generateCombatLive,
  f1: generateF1Live,
  rugby: generateRugbyLive,
};

// ============================================
// CRYPTO LIVE PRICE (CoinGecko)
// ============================================

async function generateCryptoLive() {
  const predictions = [];
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,ripple,cardano,avalanche-2,pepe&vs_currencies=usd&include_24hr_change=true';
    const headers = COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {};
    const res = await fetch(url, { headers });
    const data = await res.json();

    const coins = [
      { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', emoji: '₿' },
      { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', emoji: '💎' },
      { id: 'solana', name: 'Solana', symbol: 'SOL', emoji: '⚡' },
      { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', emoji: '🐕' },
      { id: 'ripple', name: 'XRP', symbol: 'XRP', emoji: '💧' },
      { id: 'cardano', name: 'Cardano', symbol: 'ADA', emoji: '🔷' },
      { id: 'avalanche-2', name: 'Avalanche', symbol: 'AVAX', emoji: '🔺' },
      { id: 'pepe', name: 'PEPE', symbol: 'PEPE', emoji: '🐸' }
    ];

    for (const coin of coins) {
      if (!data[coin.id]) continue;
      const price = data[coin.id].usd;
      const change = data[coin.id].usd_24h_change;

      let target;
      if (price > 10000) target = Math.round(price / 1000) * 1000 + (change > 0 ? 5000 : -2000);
      else if (price > 100) target = Math.round(price / 100) * 100 + (change > 0 ? 200 : -100);
      else if (price > 1) target = Math.round(price * 1.1);
      else target = (price * 1.15).toFixed(4);

      const targetStr = typeof target === 'number' && target > 1 ? target.toLocaleString() : target;
      const priceStr = price > 1 ? Math.round(price).toLocaleString() : price.toFixed(4);

      const templates = [
        { question: `${coin.symbol} above $${targetStr} in the next 8h?`, optionA: 'YES', optionB: 'NO' },
        { question: `${coin.symbol} going up or down in the next few hours?`, optionA: 'Up', optionB: 'Down' },
        { question: `Is $${priceStr} a good entry for ${coin.symbol}?`, optionA: 'Buy now', optionB: 'Wait' },
      ];

      predictions.push({
        ...templates[Math.floor(Math.random() * templates.length)],
        category: 'crypto', emoji: coin.emoji,
        expiresAt: expiresInHours(8),
        metadata: { coinId: coin.id, symbol: coin.symbol, priceAtCreation: price, target: parseFloat(target) }
      });
    }
  } catch (e) {
    console.error('Crypto API error:', e.message);
  }
  return pickRandom(predictions, 4);
}

// ============================================
// NEWS-BASED GENERATOR (NewsData.io)
// ============================================

async function generateFromNews(newsConfig) {
  const predictions = [];
  if (!NEWS_API_KEY) return predictions;

  try {
    let url = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&language=en&category=${newsConfig.category}`;
    if (newsConfig.q) url += `&q=${newsConfig.q}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.results) {
      for (const article of data.results.slice(0, 4)) {
        if (!article.title || article.title.length < 15) continue;
        const title = article.title.slice(0, 75);

        const fmt = NEWS_FORMATS[Math.floor(Math.random() * NEWS_FORMATS.length)];
        const finalFmt = newsConfig.predCat === 'crypto'
          ? { suffix: ' — Bullish or bearish?', a: 'Bullish', b: 'Bearish' }
          : fmt;

        predictions.push({
          question: `"${title}"${finalFmt.suffix}`,
          optionA: finalFmt.a, optionB: finalFmt.b,
          category: newsConfig.predCat, emoji: newsConfig.emoji,
          expiresAt: expiresInHours(12),
          metadata: { source: 'newsdata', type: 'opinion' }
        });
      }
    }
  } catch (e) {
    console.error(`News API error (${newsConfig.category}):`, e.message);
  }
  return pickRandom(predictions, 2);
}

// ============================================
// OPINION BACKUP (minimal — only for non-sport categories when APIs fail)
// ============================================
const OPINION_POOLS = {
  musique: [
    { question: 'Drake or Kendrick: who wins?', optionA: 'Drake', optionB: 'Kendrick', emoji: '🎵' },
    { question: 'Biggest artist in the world?', optionA: 'Taylor Swift', optionB: 'Bad Bunny', emoji: '🎵' },
    { question: 'K-Pop taking over?', optionA: 'Already did', optionB: 'Overhyped', emoji: '🇰🇷' },
    { question: 'Best rapper alive?', optionA: 'Kendrick', optionB: 'J. Cole', emoji: '🎤' },
  ],
  gaming: [
    { question: 'GTA 6 living up to the hype?', optionA: 'Legendary', optionB: 'Overhyped', emoji: '🎮' },
    { question: 'PC or Console?', optionA: 'PC master race', optionB: 'Console vibes', emoji: '🎮' },
    { question: 'PS5 or Xbox?', optionA: 'PlayStation', optionB: 'Xbox', emoji: '🎮' },
    { question: 'Nintendo Switch 2: day one buy?', optionA: 'Day one', optionB: 'Wait', emoji: '🎮' },
  ],
  cinema: [
    { question: 'Marvel done or coming back?', optionA: 'Comeback arc', optionB: 'Fatigue is real', emoji: '🎬' },
    { question: 'Netflix or Disney+?', optionA: 'Netflix', optionB: 'Disney+', emoji: '📺' },
    { question: 'Anime mainstream now?', optionA: 'Fully mainstream', optionB: 'Still niche', emoji: '🎌' },
  ],
  drama: [
    { question: 'Elon Musk: genius or villain?', optionA: 'Genius', optionB: 'Villain arc', emoji: '👀' },
    { question: 'AI taking your job in 5 years?', optionA: 'Probably', optionB: 'Humans irreplaceable', emoji: '🤖' },
    { question: 'TikTok: creative or brain rot?', optionA: 'Creative', optionB: 'Brain rot', emoji: '📱' },
  ],
  debate: [
    { question: 'Morning person or night owl?', optionA: 'Early bird', optionB: 'Night owl', emoji: '🌅' },
    { question: 'Cats or dogs?', optionA: 'Dogs forever', optionB: 'Cats superior', emoji: '🐾' },
    { question: 'Android or iPhone?', optionA: 'Android', optionB: 'iPhone', emoji: '📱' },
    { question: 'Pineapple on pizza?', optionA: 'Delicious', optionB: 'Crime', emoji: '🍕' },
  ]
};

function generateOpinionPredictions(category, count) {
  const pool = OPINION_POOLS[category];
  if (!pool || pool.length === 0) return [];

  return pickRandom(pool, count).map(p => ({
    ...p,
    category,
    expiresAt: expiresInHours(12),
    metadata: { type: 'opinion' }
  }));
}

// ============================================
// SMART GENERATOR - Main engine
// ============================================

async function addIfNotDupe(pred, activeList) {
  // Check for duplicate by comparing question fragments
  const isDupe = activeList.some(e =>
    e.question.toLowerCase().includes(pred.question.toLowerCase().slice(0, 30))
  );
  // Also check by fixture/game ID to avoid duplicates of same match
  if (!isDupe && pred.metadata) {
    const matchId = pred.metadata.fixtureId || pred.metadata.gameId || pred.metadata.fightId || pred.metadata.raceId;
    if (matchId) {
      const hasMatchDupe = activeList.some(e => {
        const eId = e.metadata?.fixtureId || e.metadata?.gameId || e.metadata?.fightId || e.metadata?.raceId;
        return eId && eId === matchId && e.metadata?.predType === pred.metadata?.predType;
      });
      if (hasMatchDupe) return false;
    }
  }
  if (!isDupe) {
    await db.addPrediction(pred);
    return true;
  }
  return false;
}

// -------------------------------------------------------------------
// WEEKLY SPORT FETCH — big batch, called Mon + Wed only (or emergency)
// Fetches ALL sports at once, 14 days ahead for football, 7 for others
// -------------------------------------------------------------------
async function weeklySportsFetch(active) {
  console.log('  WEEKLY SPORTS FETCH — loading all upcoming events...');
  let totalGenerated = 0;

  const allSports = ['football', 'nba', 'hockey', 'nfl', 'rugby', 'combat', 'f1'];

  for (const sport of allSports) {
    const generator = SPORT_GENERATORS[sport];
    if (!generator) continue;
    try {
      const preds = await generator();
      let added = 0;
      for (const pred of preds) {
        if (await addIfNotDupe(pred, active)) {
          totalGenerated++;
          added++;
          active.push(pred);
        }
      }
      console.log(`    ${sport}: ${preds.length} found, ${added} new added`);
    } catch (e) {
      console.error(`    ${sport} error:`, e.message);
    }
  }

  return totalGenerated;
}

// -------------------------------------------------------------------
// LIGHT CYCLE — crypto + news only (called every 3h)
// Sports are already loaded from weekly fetch
// -------------------------------------------------------------------
async function lightCycle(active, counts) {
  let totalGenerated = 0;

  // Crypto: prices change constantly, always worth refreshing
  if ((counts.crypto || 0) < 5) {
    try {
      const cryptoLive = await generateCryptoLive();
      for (const pred of cryptoLive) {
        if (await addIfNotDupe(pred, active)) {
          totalGenerated++;
          active.push(pred);
        }
      }
      if (cryptoLive.length > 0) console.log(`  crypto price: +${cryptoLive.length} live`);
    } catch (e) {
      console.error('  Crypto live error:', e.message);
    }
  }

  // News rotation: fresh content every cycle
  const newsToFetch = NEWS_ROTATION[newsCycleIndex % NEWS_ROTATION.length];
  newsCycleIndex++;
  console.log(`  News rotation: [${newsToFetch.map(n => n.predCat).join(', ')}]`);

  for (const newsConfig of newsToFetch) {
    try {
      const preds = await generateFromNews(newsConfig);
      for (const pred of preds) {
        if (await addIfNotDupe(pred, active)) {
          totalGenerated++;
          active.push(pred);
        }
      }
      if (preds.length > 0) console.log(`  ${newsConfig.predCat} news: +${preds.length}`);
    } catch (e) {
      console.error(`  ${newsConfig.predCat} news error:`, e.message);
    }
  }

  // Opinion backup for non-sport categories only
  const opinionCategories = ['musique', 'gaming', 'cinema', 'drama', 'debate'];
  for (const cat of opinionCategories) {
    const catCount = active.filter(p => p.category === cat).length;
    const deficit = (MIN_SLOTS[cat] || 0) - catCount;
    if (deficit <= 0) continue;

    const opinions = generateOpinionPredictions(cat, deficit);
    for (const pred of opinions) {
      if (await addIfNotDupe(pred, active)) {
        totalGenerated++;
        active.push(pred);
      }
    }
    if (opinions.length > 0) console.log(`  ${cat} opinion backup: +${opinions.length}`);
  }

  return totalGenerated;
}

// -------------------------------------------------------------------
// SMART GENERATE — decides what to do based on day of week
// -------------------------------------------------------------------
async function smartGenerate(forceWeekly = false) {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = now.getUTCHours();

  console.log(`\n=== Smart generation cycle (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]} ${hour}:00 UTC) ===`);

  const active = await db.getActivePredictions();
  let totalGenerated = 0;

  // Count per category
  const counts = {};
  for (const cat of Object.keys(MIN_SLOTS)) {
    counts[cat] = active.filter(p => p.category === cat).length;
  }
  console.log('Active counts:', JSON.stringify(counts));
  console.log(`Total active: ${active.length}`);

  // --- Decide if we need a weekly sports fetch ---
  const sportCategories = ['football', 'nba', 'hockey', 'nfl', 'rugby', 'combat', 'f1'];
  const totalSportPreds = sportCategories.reduce((sum, cat) => sum + (counts[cat] || 0), 0);

  const isWeeklyDay = (dayOfWeek === 1 || dayOfWeek === 3); // Monday or Wednesday
  const isMorning = (hour >= 6 && hour <= 10);
  const isEmergency = totalSportPreds < 5;

  if (forceWeekly || (isWeeklyDay && isMorning) || isEmergency) {
    if (isEmergency) console.log(`  EMERGENCY: only ${totalSportPreds} sport predictions active!`);
    totalGenerated += await weeklySportsFetch(active);
  } else {
    console.log(`  Sports: ${totalSportPreds} active, skipping API (next fetch: Mon/Wed morning)`);
  }

  // --- Always run crypto + news + opinion backup ---
  totalGenerated += await lightCycle(active, counts);

  console.log(`=== Generated ${totalGenerated} total ===\n`);
  return totalGenerated;
}

// ============================================
// SCHEDULER
// ============================================

async function cleanupExpired() {
  const preds = await db.getPredictions();
  const now = new Date();
  const expired = preds.filter(p => !p.resolved && new Date(p.expiresAt) < now);
  if (expired.length > 0) {
    console.log(`${expired.length} expired predictions pending resolution`);
  }
}

async function startScheduler() {
  console.log('Prediction scheduler started');
  console.log('  Sports: Mon + Wed morning (or emergency if < 5 sport preds)');
  console.log('  Crypto + News: every 3h');

  // On startup: always do a full weekly fetch to fill the app
  const active = await db.getActivePredictions();
  const sportCategories = ['football', 'nba', 'hockey', 'nfl', 'rugby', 'combat', 'f1'];
  const totalSport = sportCategories.reduce((sum, cat) => sum + active.filter(p => p.category === cat).length, 0);

  if (totalSport < 10) {
    console.log('Startup: low sport content, running full weekly fetch...');
    await smartGenerate(true); // force weekly
  } else {
    await smartGenerate(); // normal cycle (crypto + news only unless Mon/Wed)
  }

  // Main cycle: every 3 hours
  setInterval(async () => {
    await cleanupExpired();
    await smartGenerate();
  }, 3 * 60 * 60 * 1000);

  // Hourly emergency check
  setInterval(async () => {
    await cleanupExpired();
    const current = await db.getActivePredictions();
    if (current.length < 10) {
      console.log('LOW CONTENT ALERT - emergency generation...');
      await smartGenerate(true); // force weekly fetch
    }
  }, 60 * 60 * 1000);
}

// Backward compatibility
async function generateDailyPredictions() {
  return smartGenerate(true);
}

module.exports = { generateDailyPredictions, cleanupExpired, startScheduler };
