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
  // Sport (API-Sports)
  crypto: 3,
  football: 3,
  nba: 2,
  combat: 1,
  f1: 2,
  nfl: 1,
  hockey: 2,
  rugby: 1,
  // News-powered (NewsData.io)
  musique: 2,
  gaming: 2,
  cinema: 2,
  drama: 2,
  politics: 2,
  world: 2,
  science: 1,
  health: 1,
  trending: 2,
  crime: 1,
  environment: 1,
  business: 1,
  sports_news: 1,
  lifestyle: 1,
  food: 1,
  education: 1,
  tourism: 1,
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

// ============================================
// NEWS ROTATION — uses ALL 17 NewsData categories
// + dedicated /crypto endpoint
// + sentiment, removeduplicate, prioritydomain
// 200 credits/day = we use ~80-100, plenty of room
// ============================================
let newsCycleIndex = 0;

const NEWS_ROTATION = [
  // Cycle 0: Crypto dedicated + Music + Breaking
  [
    { endpoint: 'crypto', coin: 'btc,eth,sol,doge,xrp', predCat: 'crypto', emoji: '₿', formats: 'crypto' },
    { category: 'entertainment', q: 'music%20OR%20album%20OR%20rapper%20OR%20singer%20OR%20spotify%20OR%20concert', predCat: 'musique', emoji: '🎵', formats: 'entertainment' },
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥', formats: 'general', prioritydomain: 'top' },
    { category: 'crime', q: null, predCat: 'crime', emoji: '🚨', formats: 'crime' },
  ],
  // Cycle 1: Gaming + Politics + World + Environment
  [
    { category: 'technology', q: 'gaming%20OR%20playstation%20OR%20xbox%20OR%20GTA%20OR%20fortnite%20OR%20nintendo%20OR%20Steam', predCat: 'gaming', emoji: '🎮', formats: 'entertainment' },
    { category: 'politics', q: null, predCat: 'politics', emoji: '🏛', formats: 'politics' },
    { category: 'world', q: null, predCat: 'world', emoji: '🌍', formats: 'general', prioritydomain: 'top' },
    { category: 'environment', q: null, predCat: 'environment', emoji: '🌱', formats: 'environment' },
  ],
  // Cycle 2: Cinema + Science + Crypto + Sports news
  [
    { category: 'entertainment', q: 'movie%20OR%20Netflix%20OR%20Disney%20OR%20Marvel%20OR%20series%20OR%20HBO%20OR%20anime', predCat: 'cinema', emoji: '🎬', formats: 'entertainment' },
    { category: 'science', q: null, predCat: 'science', emoji: '🔬', formats: 'science' },
    { endpoint: 'crypto', coin: 'ada,avax,pepe,bnb,matic', predCat: 'crypto', emoji: '📰', formats: 'crypto' },
    { category: 'sports', q: 'transfer%20OR%20injury%20OR%20record%20OR%20retire%20OR%20coach%20OR%20deal', predCat: 'sports_news', emoji: '📰', formats: 'sports' },
  ],
  // Cycle 3: Drama/Tech + Health + Lifestyle + Trending
  [
    { category: 'technology', q: 'AI%20OR%20Elon%20Musk%20OR%20Apple%20OR%20TikTok%20OR%20viral%20OR%20Meta%20OR%20OpenAI', predCat: 'drama', emoji: '👀', formats: 'tech' },
    { category: 'health', q: null, predCat: 'health', emoji: '💪', formats: 'health' },
    { category: 'lifestyle', q: null, predCat: 'lifestyle', emoji: '✨', formats: 'lifestyle' },
    { category: 'entertainment', q: 'celebrity%20OR%20award%20OR%20viral%20OR%20trending%20OR%20scandal', predCat: 'trending', emoji: '🔥', formats: 'general' },
  ],
  // Cycle 4: Crypto + Music + Business + Food
  [
    { endpoint: 'crypto', coin: 'btc,eth,sol', predCat: 'crypto', emoji: '₿', formats: 'crypto' },
    { category: 'entertainment', q: 'concert%20OR%20Grammy%20OR%20rapper%20OR%20kpop%20OR%20album%20OR%20tour', predCat: 'musique', emoji: '🎵', formats: 'entertainment' },
    { category: 'business', q: 'startup%20OR%20IPO%20OR%20acquisition%20OR%20layoffs%20OR%20billion', predCat: 'business', emoji: '💼', formats: 'business' },
    { category: 'food', q: null, predCat: 'food', emoji: '🍔', formats: 'lifestyle' },
  ],
  // Cycle 5: Gaming + World + Politics + Education
  [
    { category: 'technology', q: 'esports%20OR%20Steam%20OR%20VR%20OR%20console%20OR%20Twitch%20OR%20streamer', predCat: 'gaming', emoji: '🎮', formats: 'entertainment' },
    { category: 'world', q: null, predCat: 'world', emoji: '🌍', formats: 'general', prioritydomain: 'top' },
    { category: 'politics', q: 'election%20OR%20president%20OR%20law%20OR%20vote%20OR%20senate', predCat: 'politics', emoji: '🏛', formats: 'politics' },
    { category: 'education', q: null, predCat: 'education', emoji: '🎓', formats: 'general' },
  ],
  // Cycle 6: Cinema + Drama + Science + Crime
  [
    { category: 'entertainment', q: 'box%20office%20OR%20anime%20OR%20series%20OR%20Oscar%20OR%20Emmy', predCat: 'cinema', emoji: '🎬', formats: 'entertainment' },
    { category: 'technology', q: 'controversy%20OR%20scandal%20OR%20leaked%20OR%20hack%20OR%20ban', predCat: 'drama', emoji: '👀', formats: 'tech' },
    { category: 'science', q: 'space%20OR%20NASA%20OR%20discovery%20OR%20Mars%20OR%20quantum', predCat: 'science', emoji: '🔬', formats: 'science' },
    { category: 'crime', q: 'trial%20OR%20arrest%20OR%20fraud%20OR%20investigation', predCat: 'crime', emoji: '🚨', formats: 'crime' },
  ],
  // Cycle 7: Health + Trending + Crypto + Sports news
  [
    { category: 'health', q: 'fitness%20OR%20mental%20health%20OR%20diet%20OR%20wellness%20OR%20vaccine', predCat: 'health', emoji: '💪', formats: 'health' },
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥', formats: 'general', sentiment: 'positive' },
    { endpoint: 'crypto', coin: 'btc,eth,doge,xrp', predCat: 'crypto', emoji: '₿', formats: 'crypto' },
    { category: 'sports', q: 'champion%20OR%20final%20OR%20trade%20OR%20scandal%20OR%20doping', predCat: 'sports_news', emoji: '📰', formats: 'sports' },
  ],
  // Cycle 8: Environment + Lifestyle + Business + Tourism
  [
    { category: 'environment', q: 'climate%20OR%20pollution%20OR%20renewable%20OR%20wildfire%20OR%20flood', predCat: 'environment', emoji: '🌱', formats: 'environment' },
    { category: 'lifestyle', q: 'trend%20OR%20viral%20OR%20fashion%20OR%20wellness', predCat: 'lifestyle', emoji: '✨', formats: 'lifestyle' },
    { category: 'business', q: 'Tesla%20OR%20Amazon%20OR%20Google%20OR%20Microsoft%20OR%20Apple', predCat: 'business', emoji: '💼', formats: 'business' },
    { category: 'tourism', q: null, predCat: 'tourism', emoji: '✈️', formats: 'lifestyle' },
  ],
  // Cycle 9: French news + Drama + Food + World sentiment
  [
    { category: 'top', q: null, predCat: 'trending', emoji: '🇫🇷', formats: 'general', language: 'fr', country: 'fr' },
    { category: 'technology', q: 'AI%20OR%20robot%20OR%20ChatGPT%20OR%20autonomous%20OR%20deepfake', predCat: 'drama', emoji: '🤖', formats: 'tech' },
    { category: 'food', q: 'restaurant%20OR%20chef%20OR%20recipe%20OR%20vegan%20OR%20fast%20food', predCat: 'food', emoji: '🍔', formats: 'lifestyle' },
    { category: 'world', q: null, predCat: 'world', emoji: '🌍', formats: 'general', sentiment: 'negative' },
  ],
  // Cycle 10: EVENT HUNTER — specifically looks for upcoming events
  [
    { category: 'entertainment', q: 'premiere%20OR%20finale%20OR%20release%20OR%20ceremony%20OR%20award%20show', predCat: 'cinema', emoji: '🎬', formats: 'entertainment' },
    { category: 'entertainment', q: 'concert%20OR%20tour%20OR%20festival%20OR%20show%20OR%20live%20event', predCat: 'musique', emoji: '🎵', formats: 'entertainment' },
    { category: 'politics', q: 'summit%20OR%20debate%20OR%20election%20OR%20hearing%20OR%20vote', predCat: 'politics', emoji: '🏛', formats: 'politics' },
    { category: 'technology', q: 'launch%20OR%20keynote%20OR%20announcement%20OR%20reveal%20OR%20event', predCat: 'drama', emoji: '🚀', formats: 'tech' },
  ],
  // Cycle 11: MORE EVENTS — sports transfers, business moves, world events
  [
    { category: 'sports', q: 'trade%20OR%20transfer%20OR%20draft%20OR%20playoffs%20OR%20final', predCat: 'sports_news', emoji: '📰', formats: 'sports' },
    { category: 'business', q: 'IPO%20OR%20merger%20OR%20acquisition%20OR%20earnings%20OR%20launch', predCat: 'business', emoji: '💼', formats: 'business' },
    { category: 'world', q: 'summit%20OR%20treaty%20OR%20sanctions%20OR%20crisis%20OR%20agreement', predCat: 'world', emoji: '🌍', formats: 'general', prioritydomain: 'top' },
    { endpoint: 'crypto', coin: 'btc,eth,sol,doge', predCat: 'crypto', emoji: '₿', formats: 'crypto' },
  ],
];

// Question formats per category context — way more variety
const NEWS_FORMATS_BY_TYPE = {
  general: [
    { suffix: ' — Will this matter in a week?', a: 'Big impact', b: 'Already forgotten' },
    { suffix: ' — Overhyped or underrated?', a: 'Overhyped', b: 'Underrated' },
    { suffix: ' — W or L?', a: 'Massive W', b: 'Huge L' },
    { suffix: ' — Real deal or just noise?', a: 'Real deal', b: 'Just noise' },
    { suffix: ' — Will people still care tomorrow?', a: 'Yes, big deal', b: 'Nah, next' },
    { suffix: ' — Hot take: good or bad for society?', a: 'Good', b: 'Bad' },
  ],
  crypto: [
    { suffix: ' — Bullish or bearish signal?', a: 'Bullish', b: 'Bearish' },
    { suffix: ' — Buy the rumor or sell the news?', a: 'Buy', b: 'Sell' },
    { suffix: ' — Pump incoming or nothing burger?', a: 'Pump incoming', b: 'Nothing burger' },
    { suffix: ' — Good for adoption?', a: 'Mass adoption', b: 'Nobody cares' },
    { suffix: ' — Will this move the market?', a: 'Market mover', b: 'Price stays flat' },
  ],
  politics: [
    { suffix: ' — Will this change anything?', a: 'Game changer', b: 'Business as usual' },
    { suffix: ' — Public support or backlash?', a: 'Public supports it', b: 'Major backlash' },
    { suffix: ' — Will this actually happen?', a: 'It\'s happening', b: 'Dead on arrival' },
    { suffix: ' — Good move or political suicide?', a: 'Smart move', b: 'Political suicide' },
    { suffix: ' — Will this pass into law?', a: 'YES', b: 'NO' },
  ],
  tech: [
    { suffix: ' — Innovation or hype?', a: 'True innovation', b: 'Pure hype' },
    { suffix: ' — Will this disrupt the industry?', a: 'Total disruption', b: 'Just noise' },
    { suffix: ' — Progress or danger?', a: 'Progress', b: 'Dangerous' },
    { suffix: ' — Users will love it or hate it?', a: 'Love it', b: 'Hate it' },
    { suffix: ' — Is this the future?', a: 'The future is here', b: 'Not even close' },
  ],
  entertainment: [
    { suffix: ' — Hit or flop?', a: 'Massive hit', b: 'Total flop' },
    { suffix: ' — Will it break the internet?', a: 'Internet broken', b: 'Nobody cares' },
    { suffix: ' — Career boost or career over?', a: 'Career boost', b: 'It\'s over' },
    { suffix: ' — Iconic or forgettable?', a: 'Iconic', b: 'Forgettable' },
    { suffix: ' — Fan reaction: love or hate?', a: 'Fans love it', b: 'Fans hate it' },
  ],
  science: [
    { suffix: ' — Breakthrough or premature hype?', a: 'Real breakthrough', b: 'Premature hype' },
    { suffix: ' — Will this change our lives?', a: 'Life-changing', b: 'Lab curiosity only' },
    { suffix: ' — Nobel Prize worthy?', a: 'Nobel level', b: 'Not that big' },
    { suffix: ' — Available to the public within 5 years?', a: 'YES', b: 'NO way' },
  ],
  health: [
    { suffix: ' — Game changer for health?', a: 'Game changer', b: 'Overhyped' },
    { suffix: ' — Should people worry?', a: 'Yes, be careful', b: 'No panic needed' },
    { suffix: ' — Will this become mainstream?', a: 'Mainstream soon', b: 'Niche forever' },
    { suffix: ' — Trust the science on this one?', a: 'Science is clear', b: 'Needs more research' },
  ],
  crime: [
    { suffix: ' — Guilty or innocent?', a: 'Guilty', b: 'Innocent' },
    { suffix: ' — Justice will be served?', a: 'Justice wins', b: 'They\'ll walk free' },
    { suffix: ' — Will this case go viral?', a: 'Already viral', b: 'Under the radar' },
    { suffix: ' — Bigger scandal behind this?', a: 'Tip of the iceberg', b: 'Isolated case' },
  ],
  environment: [
    { suffix: ' — Will this actually help the planet?', a: 'Real impact', b: 'Greenwashing' },
    { suffix: ' — Too late or still time?', a: 'Still time to act', b: 'Too late' },
    { suffix: ' — Governments will act?', a: 'Action incoming', b: 'All talk no action' },
    { suffix: ' — Will people change their habits?', a: 'People will adapt', b: 'Nothing changes' },
  ],
  business: [
    { suffix: ' — Smart business move?', a: 'Genius move', b: 'Terrible idea' },
    { suffix: ' — Stock going up or down after this?', a: 'Stock goes up', b: 'Stock tanks' },
    { suffix: ' — Will competitors follow?', a: 'Everyone copies', b: 'Unique strategy' },
    { suffix: ' — Good for employees or just shareholders?', a: 'Good for all', b: 'Shareholders only' },
  ],
  sports: [
    { suffix: ' — Good deal or overpay?', a: 'Great deal', b: 'Overpaid' },
    { suffix: ' — Will this impact the season?', a: 'Season changer', b: 'Minor move' },
    { suffix: ' — Fans happy or furious?', a: 'Fans love it', b: 'Fans furious' },
    { suffix: ' — Dynasty building or desperate move?', a: 'Dynasty mode', b: 'Desperate' },
  ],
  lifestyle: [
    { suffix: ' — Trend or fad?', a: 'Here to stay', b: 'Gone in a month' },
    { suffix: ' — Would you try it?', a: 'Sign me up', b: 'Hard pass' },
    { suffix: ' — The future of living?', a: 'Absolutely', b: 'Nah' },
    { suffix: ' — Overrated or underrated?', a: 'Overrated', b: 'Underrated gem' },
  ],
};

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

        const expiry = kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72);

        // Dynamic F1 predictions — no hardcoded driver names
        const f1Templates = [
          { question: `🏎 F1 ${name}: Who takes pole? (${dateStr})`, optionA: 'Red Bull', optionB: 'McLaren', predType: 'pole' },
          { question: `🏎 F1 ${name}: Safety Car during the race? (${dateStr})`, optionA: 'YES', optionB: 'NO', predType: 'safety_car' },
          { question: `🏎 F1 ${name}: Will the polesitter win? (${dateStr})`, optionA: 'YES', optionB: 'NO', predType: 'pole_wins' },
          { question: `🏎 F1 ${name}: Top 3 finish for Ferrari? (${dateStr})`, optionA: 'YES', optionB: 'NO', predType: 'ferrari_podium' },
          { question: `🏎 F1 ${name}: Red Bull vs McLaren — Who wins? (${dateStr})`, optionA: 'Red Bull', optionB: 'McLaren', predType: 'team_battle' },
          { question: `🏎 F1 ${name}: Any DNF in top 5? (${dateStr})`, optionA: 'YES', optionB: 'NO', predType: 'dnf' },
          { question: `🏎 F1 ${name}: Over 1 pit stop for the winner? (${dateStr})`, optionA: 'Multi-stop', optionB: '1-stop', predType: 'pit_strategy' },
        ];

        // Pick 3 different templates for this race
        const picked = pickRandom(f1Templates, 3);
        for (const tmpl of picked) {
          predictions.push({
            question: tmpl.question,
            optionA: tmpl.optionA, optionB: tmpl.optionB,
            category: 'f1', emoji: '🏎',
            expiresAt: expiry,
            metadata: { ...baseMetadata, predType: tmpl.predType }
          });
        }
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
// NEWS-BASED GENERATOR v2 (NewsData.io)
// Uses /latest + /crypto endpoints
// Filters: removeduplicate, prioritydomain, sentiment, timeframe
// ============================================

async function generateFromNews(newsConfig) {
  const predictions = [];
  if (!NEWS_API_KEY) return predictions;

  try {
    let url;

    if (newsConfig.endpoint === 'crypto') {
      // Dedicated crypto endpoint — way better for crypto news
      url = `https://newsdata.io/api/1/crypto?apikey=${NEWS_API_KEY}&language=en&removeduplicate=1`;
      if (newsConfig.coin) url += `&coin=${newsConfig.coin}`;
    } else {
      // Standard latest endpoint
      const lang = newsConfig.language || 'en';
      url = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&language=${lang}&category=${newsConfig.category}&removeduplicate=1&timeframe=24`;
      if (newsConfig.q) url += `&q=${newsConfig.q}`;
      if (newsConfig.prioritydomain) url += `&prioritydomain=${newsConfig.prioritydomain}`;
      if (newsConfig.sentiment) url += `&sentiment=${newsConfig.sentiment}`;
      if (newsConfig.country) url += `&country=${newsConfig.country}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) return predictions;

    // Get format pool for this category
    const formatType = newsConfig.formats || 'general';
    const formatPool = NEWS_FORMATS_BY_TYPE[formatType] || NEWS_FORMATS_BY_TYPE.general;

    // Process more articles (up to 8), create more predictions
    for (const article of data.results.slice(0, 8)) {
      if (!article.title || article.title.length < 15) continue;

      const title = article.title.slice(0, 80);
      const fmt = formatPool[Math.floor(Math.random() * formatPool.length)];

      // Use article sentiment if available to pick better format
      let finalFmt = fmt;
      if (article.sentiment === 'positive' && formatType !== 'crypto') {
        const positiveFmts = [
          { suffix: ' — Will this positive trend continue?', a: 'Just the beginning', b: 'Peak reached' },
          { suffix: ' — Celebrate or stay cautious?', a: 'Celebrate!', b: 'Stay cautious' },
          ...formatPool
        ];
        finalFmt = positiveFmts[Math.floor(Math.random() * positiveFmts.length)];
      } else if (article.sentiment === 'negative' && formatType !== 'crypto') {
        const negativeFmts = [
          { suffix: ' — Will this get worse?', a: 'It gets worse', b: 'Worst is over' },
          { suffix: ' — Recovery coming?', a: 'Bounce back soon', b: 'Long road ahead' },
          ...formatPool
        ];
        finalFmt = negativeFmts[Math.floor(Math.random() * negativeFmts.length)];
      }

      // Smart expiry: upcoming events stay longer, regular news = 12h
      const expiry = getSmartExpiry(article.title, article.description);
      const isEvent = expiry !== expiresInHours(12);

      predictions.push({
        question: `"${title}"${finalFmt.suffix}`,
        optionA: finalFmt.a, optionB: finalFmt.b,
        category: newsConfig.predCat, emoji: newsConfig.emoji,
        expiresAt: expiry,
        metadata: {
          source: 'newsdata',
          type: isEvent ? 'event' : 'opinion',
          articleId: article.article_id,
          sentiment: article.sentiment || null,
          sourceUrl: article.link || null
        }
      });
    }
  } catch (e) {
    console.error(`News API error (${newsConfig.predCat}):`, e.message);
  }
  // Return more predictions per call — 3 instead of 2
  return pickRandom(predictions, 3);
}

// ============================================
// SMART EXPIRY — detect upcoming events in news articles
// If article talks about a future event, keep prediction alive until then
// ============================================

const EVENT_KEYWORDS = [
  // Time references (upcoming)
  'this weekend', 'this saturday', 'this sunday', 'this friday',
  'next week', 'next month', 'tomorrow', 'coming soon',
  'upcoming', 'set to', 'scheduled', 'is expected',
  'will take place', 'will be held', 'slated for',
  // Entertainment events
  'premiere', 'premieres', 'finale', 'season finale', 'series finale',
  'release date', 'releases', 'drops', 'launching', 'launches',
  'ceremony', 'award show', 'oscars', 'emmys', 'grammys', 'golden globe',
  'super bowl', 'halftime',
  'concert', 'tour', 'festival', 'coachella',
  'fight night', 'pay-per-view', 'ppv', 'main event',
  // Politics/World events
  'summit', 'debate', 'hearing', 'vote', 'election day',
  'inauguration', 'trial begins', 'verdict',
  'g7', 'g20', 'un assembly', 'nato',
  // Tech/Business events
  'keynote', 'product launch', 'wwdc', 'google i/o', 'ces ',
  'earnings report', 'ipo', 'going public',
  // Sports events
  'draft', 'trade deadline', 'all-star', 'playoffs',
  'world cup', 'champions league', 'grand prix',
];

function getSmartExpiry(articleTitle, articleDescription) {
  const text = `${articleTitle} ${articleDescription || ''}`.toLowerCase();

  // Check if article mentions a future event
  const isEvent = EVENT_KEYWORDS.some(kw => text.includes(kw));

  if (isEvent) {
    // Check if it's this weekend (2-4 days)
    if (text.includes('this weekend') || text.includes('this saturday') ||
        text.includes('this sunday') || text.includes('this friday')) {
      // Expire Sunday night (find next Sunday)
      const now = new Date();
      const dayOfWeek = now.getUTCDay();
      const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
      return expiresInHours(daysUntilSunday * 24);
    }

    // "next week" or "next month" = keep for 7 days
    if (text.includes('next week') || text.includes('next month') || text.includes('slated for')) {
      return expiresInHours(168); // 7 days
    }

    // Generic upcoming event = keep for 72h (3 days)
    return expiresInHours(72);
  }

  // Regular news = 12h
  return expiresInHours(12);
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
