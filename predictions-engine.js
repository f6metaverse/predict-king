const db = require('./db');

// ============================================
// PREDICT KING - AUTO-GENERATION ENGINE v2
// Maximum LIVE content, smart API rotation
// ============================================

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';

// ============================================
// DURATION CONFIG (in hours)
// ============================================
const DURATION = {
  FLASH: 4,
  SHORT: 6,
  MEDIUM: 8,
  SPORT_LIVE: 12,
  NEWS: 12,
  CRYPTO_PRICE: 8,
  LONG: 24,
  EVENT: 48
};

// Min active predictions per category
const MIN_SLOTS = {
  crypto: 3,
  football: 2,
  nba: 2,
  combat: 1,
  f1: 1,
  nfl: 1,
  hockey: 1,
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
// ROTATION SYSTEM for API-Sports
// Cycle through groups to spread API usage
// ============================================
let apiSportsCycleIndex = 0;

const API_SPORTS_ROTATION = [
  // Cycle 0: Football + NBA (most popular)
  ['football', 'nba'],
  // Cycle 1: Hockey + Combat
  ['hockey', 'combat'],
  // Cycle 2: Football + NFL
  ['football', 'nfl'],
  // Cycle 3: NBA + Rugby + F1
  ['nba', 'rugby', 'f1'],
  // Cycle 4: Football + Hockey
  ['football', 'hockey'],
  // Cycle 5: Combat + NFL + F1
  ['combat', 'nfl', 'f1'],
  // Cycle 6: Football + NBA (repeat popular)
  ['football', 'nba'],
  // Cycle 7: All minor sports catch-up
  ['hockey', 'rugby', 'combat'],
];

// Rotation for NewsData categories
let newsCycleIndex = 0;

const NEWS_ROTATION = [
  // Cycle 0: Crypto + Entertainment + Top
  [
    { category: 'business', q: 'crypto%20OR%20bitcoin%20OR%20ethereum', predCat: 'crypto', emoji: '📰' },
    { category: 'entertainment', q: 'music%20OR%20album%20OR%20rapper%20OR%20singer%20OR%20spotify', predCat: 'musique', emoji: '🎵' },
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥' },
  ],
  // Cycle 1: Tech/Gaming + Politics + World
  [
    { category: 'technology', q: 'gaming%20OR%20playstation%20OR%20xbox%20OR%20GTA%20OR%20fortnite%20OR%20nintendo', predCat: 'gaming', emoji: '🎮' },
    { category: 'politics', q: null, predCat: 'politics', emoji: '🏛' },
    { category: 'world', q: null, predCat: 'world', emoji: '🌍' },
  ],
  // Cycle 2: Cinema + Science + Crypto
  [
    { category: 'entertainment', q: 'movie%20OR%20Netflix%20OR%20Disney%20OR%20Marvel%20OR%20series%20OR%20streaming', predCat: 'cinema', emoji: '🎬' },
    { category: 'science', q: null, predCat: 'science', emoji: '🔬' },
    { category: 'business', q: 'crypto%20OR%20bitcoin%20OR%20ethereum%20OR%20blockchain', predCat: 'crypto', emoji: '📰' },
  ],
  // Cycle 3: Drama/Tech + Health + Entertainment
  [
    { category: 'technology', q: 'AI%20OR%20Elon%20Musk%20OR%20Apple%20OR%20TikTok%20OR%20viral%20OR%20influencer', predCat: 'drama', emoji: '👀' },
    { category: 'health', q: null, predCat: 'health', emoji: '💪' },
    { category: 'entertainment', q: 'celebrity%20OR%20award%20OR%20viral%20OR%20trending', predCat: 'trending', emoji: '🔥' },
  ],
  // Cycle 4: Crypto + Music + Top news
  [
    { category: 'business', q: 'crypto%20OR%20bitcoin%20OR%20solana%20OR%20memecoin', predCat: 'crypto', emoji: '📰' },
    { category: 'entertainment', q: 'concert%20OR%20Grammy%20OR%20rapper%20OR%20kpop%20OR%20album', predCat: 'musique', emoji: '🎵' },
    { category: 'top', q: null, predCat: 'drama', emoji: '👀' },
  ],
  // Cycle 5: Gaming + World + Politics
  [
    { category: 'technology', q: 'esports%20OR%20Steam%20OR%20gaming%20OR%20VR%20OR%20console', predCat: 'gaming', emoji: '🎮' },
    { category: 'world', q: null, predCat: 'world', emoji: '🌍' },
    { category: 'politics', q: null, predCat: 'politics', emoji: '🏛' },
  ],
  // Cycle 6: Cinema + Drama + Science
  [
    { category: 'entertainment', q: 'box%20office%20OR%20anime%20OR%20series%20OR%20Netflix%20OR%20HBO', predCat: 'cinema', emoji: '🎬' },
    { category: 'technology', q: 'startup%20OR%20viral%20OR%20controversy%20OR%20scandal', predCat: 'drama', emoji: '👀' },
    { category: 'science', q: 'space%20OR%20NASA%20OR%20discovery%20OR%20breakthrough', predCat: 'science', emoji: '🔬' },
  ],
  // Cycle 7: Health + Trending + Crypto
  [
    { category: 'health', q: 'fitness%20OR%20mental%20health%20OR%20diet%20OR%20wellness', predCat: 'health', emoji: '💪' },
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥' },
    { category: 'business', q: 'bitcoin%20OR%20ethereum%20OR%20crypto%20OR%20DeFi', predCat: 'crypto', emoji: '📰' },
  ],
];

// Question formats to keep news-based predictions varied
const NEWS_FORMATS = [
  { suffix: ' — Will this matter in a week?', a: 'Big impact', b: 'Already forgotten' },
  { suffix: ' — Agree or disagree?', a: 'Agree', b: 'Disagree' },
  { suffix: ' — Good or bad news?', a: 'Good', b: 'Bad' },
  { suffix: ' — Overhyped or underrated?', a: 'Overhyped', b: 'Underrated' },
  { suffix: ' — W or L?', a: 'Massive W', b: 'Huge L' },
  { suffix: ' — Hit or miss?', a: 'Hit', b: 'Miss' },
  { suffix: ' — Real deal or just noise?', a: 'Real deal', b: 'Just noise' },
  { suffix: ' — Bullish or bearish?', a: 'Bullish', b: 'Bearish' },
];

// ============================================
// OPINION BACKUP POOLS (for when APIs fail)
// ============================================
const OPINION_POOLS = {
  crypto: [
    { question: 'Bitcoin to $150K before end of year?', optionA: 'Absolutely', optionB: 'No way', emoji: '₿' },
    { question: 'Is Solana the Ethereum killer?', optionA: 'SOL wins', optionB: 'ETH forever', emoji: '⚡' },
    { question: 'Memecoins: genius or gambling?', optionA: 'Genius plays', optionB: 'Pure gambling', emoji: '🐸' },
    { question: 'Best long-term hold?', optionA: 'Bitcoin', optionB: 'Ethereum', emoji: '💰' },
    { question: 'NFTs making a comeback?', optionA: 'Comeback loading', optionB: 'Dead forever', emoji: '🖼' },
    { question: 'DOGE or SHIB: which survives longer?', optionA: 'DOGE', optionB: 'SHIB', emoji: '🐕' },
    { question: 'Crypto winter coming again?', optionA: 'Winter is here', optionB: 'Bull run continues', emoji: '❄' },
    { question: 'Best exchange right now?', optionA: 'Binance', optionB: 'Bybit', emoji: '📈' },
    { question: 'AI + Crypto tokens: legit or scam?', optionA: 'Next big thing', optionB: 'Mostly scams', emoji: '🤖' },
    { question: 'Layer 2s killing Layer 1s?', optionA: 'L2 is the future', optionB: 'L1 stays king', emoji: '🔗' },
  ],
  football: [
    { question: 'Best player in the world right now?', optionA: 'Haaland', optionB: 'Mbappe', emoji: '⚽' },
    { question: 'Messi the GOAT or Ronaldo?', optionA: 'Messi', optionB: 'Ronaldo', emoji: '🐐' },
    { question: 'Real Madrid winning another UCL?', optionA: 'Obviously', optionB: 'Not this time', emoji: '🏆' },
    { question: 'Best young talent in football?', optionA: 'Lamine Yamal', optionB: 'Bellingham', emoji: '⭐' },
    { question: 'VAR: good or bad for football?', optionA: 'Good', optionB: 'Ruining it', emoji: '📺' },
    { question: 'Who wins the World Cup 2026?', optionA: 'France', optionB: 'Argentina', emoji: '🏆' },
    { question: 'Saudi League becoming top 5?', optionA: 'In 5 years yes', optionB: 'Never serious', emoji: '🇸🇦' },
    { question: 'Best manager alive?', optionA: 'Guardiola', optionB: 'Ancelotti', emoji: '🧠' },
  ],
  nba: [
    { question: 'Best player in the NBA?', optionA: 'Wembanyama', optionB: 'Jokic', emoji: '🏀' },
    { question: 'LeBron top 1 all time?', optionA: 'GOAT', optionB: 'MJ first', emoji: '🏀' },
    { question: 'Steph Curry: greatest shooter ever?', optionA: 'No debate', optionB: 'Overrated take', emoji: '🎯' },
    { question: 'Lakers making playoffs?', optionA: 'They find a way', optionB: 'Lottery bound', emoji: '🏀' },
    { question: '3-point era ruining basketball?', optionA: 'It\'s boring now', optionB: 'Evolution', emoji: '🏀' },
  ],
  combat: [
    { question: 'Jon Jones the MMA GOAT?', optionA: 'Undisputed', optionB: 'Overrated', emoji: '🥊' },
    { question: 'Boxing or MMA: better sport?', optionA: 'Boxing', optionB: 'MMA', emoji: '🥊' },
    { question: 'Islam Makhachev losing this year?', optionA: 'Someone beats him', optionB: 'Unbeatable', emoji: '🥊' },
    { question: 'Best pound-for-pound fighter?', optionA: 'Islam Makhachev', optionB: 'Alex Pereira', emoji: '🏆' },
  ],
  f1: [
    { question: 'Verstappen winning another title?', optionA: 'Unstoppable', optionB: 'Competition caught up', emoji: '🏎' },
    { question: 'Hamilton regretting Ferrari?', optionA: 'Big mistake', optionB: 'Best move ever', emoji: '🏎' },
    { question: 'Norris becoming world champion?', optionA: 'Next in line', optionB: 'Not in this era', emoji: '🏎' },
  ],
  nfl: [
    { question: 'Mahomes the GOAT QB?', optionA: 'Already is', optionB: 'Needs more rings', emoji: '🏈' },
    { question: 'Cowboys ever winning another Super Bowl?', optionA: 'Someday', optionB: 'Never again', emoji: '🏈' },
  ],
  hockey: [
    { question: 'McDavid the best hockey player ever?', optionA: 'Generational', optionB: 'Gretzky untouchable', emoji: '🏒' },
    { question: 'A Canadian team winning the Cup this year?', optionA: 'This is the year', optionB: 'Nope', emoji: '🏒' },
  ],
  rugby: [
    { question: 'Best rugby nation?', optionA: 'New Zealand', optionB: 'South Africa', emoji: '🏉' },
    { question: 'Rugby growing or dying?', optionA: 'Growing fast', optionB: 'Struggling', emoji: '🏉' },
  ],
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
  politics: [
    { question: 'USA staying the superpower?', optionA: 'USA forever', optionB: 'China catching up', emoji: '🏛' },
    { question: 'EU getting stronger or weaker?', optionA: 'Stronger', optionB: 'Falling apart', emoji: '🇪🇺' },
  ],
  world: [
    { question: 'Climate change: still fixable?', optionA: 'If we act now', optionB: 'Too late', emoji: '🌍' },
    { question: 'Global economy: growth or recession?', optionA: 'Growth', optionB: 'Recession', emoji: '📉' },
  ],
  science: [
    { question: 'AI achieving AGI before 2030?', optionA: 'Definitely', optionB: 'Way further out', emoji: '🔬' },
    { question: 'Humans on Mars before 2035?', optionA: 'SpaceX delivers', optionB: 'Too ambitious', emoji: '🚀' },
  ],
  health: [
    { question: 'Ozempic: game changer or dangerous?', optionA: 'Game changer', optionB: 'Risky shortcut', emoji: '💪' },
    { question: 'Sleep or exercise: more important?', optionA: 'Sleep', optionB: 'Exercise', emoji: '😴' },
  ],
  trending: [
    { question: 'What breaks the internet this week?', optionA: 'Celebrity drama', optionB: 'Tech news', emoji: '🔥' },
    { question: 'Internet culture: golden age or downfall?', optionA: 'Golden age', optionB: 'Getting worse', emoji: '🔥' },
  ],
  debate: [
    { question: 'Morning person or night owl?', optionA: 'Early bird', optionB: 'Night owl', emoji: '🌅' },
    { question: 'Cats or dogs?', optionA: 'Dogs forever', optionB: 'Cats superior', emoji: '🐾' },
    { question: 'Android or iPhone?', optionA: 'Android', optionB: 'iPhone', emoji: '📱' },
    { question: 'Pineapple on pizza?', optionA: 'Delicious', optionB: 'Crime', emoji: '🍕' },
    { question: 'University worth it in 2026?', optionA: 'Still essential', optionB: 'Overpriced paper', emoji: '🎓' },
    { question: '4-day work week: realistic?', optionA: 'The future', optionB: 'Dream on', emoji: '💼' },
  ]
};

// ============================================
// API-SPORTS GENERATORS
// ============================================

async function generateFootballLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };

    const res1 = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}&season=2025`, { headers });
    const data1 = await res1.json();
    let allMatches = [...(data1.response || [])];

    // Only fetch tomorrow if today is thin
    if (allMatches.length < 4) {
      const res2 = await fetch(`https://v3.football.api-sports.io/fixtures?date=${tomorrow}&season=2025`, { headers });
      const data2 = await res2.json();
      allMatches.push(...(data2.response || []));
    }

    const topLeagues = [39, 140, 61, 135, 2, 78, 253, 262];
    const topMatches = allMatches.filter(m => topLeagues.includes(m.league?.id));
    const matches = topMatches.length > 0 ? topMatches : allMatches;

    for (const match of matches.slice(0, 6)) {
      const home = match.teams.home.name;
      const away = match.teams.away.name;
      const league = match.league.name;

      const templates = [
        { question: `${league}: ${home} vs ${away} — Who wins?`, optionA: home, optionB: away },
        { question: `${home} vs ${away}: Over 2.5 goals?`, optionA: 'YES', optionB: 'NO' },
        { question: `Clean sheet for ${home} against ${away}?`, optionA: 'YES', optionB: 'NO' },
      ];

      predictions.push({
        ...templates[Math.floor(Math.random() * templates.length)],
        category: 'football', emoji: '⚽',
        expiresAt: expires(DURATION.SPORT_LIVE)
      });
    }
  } catch (e) {
    console.error('Football API error:', e.message);
  }
  return pickRandom(predictions, 4);
}

async function generateNBALive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`https://v1.basketball.api-sports.io/games?date=${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response) {
      const nbaGames = data.response.filter(g => g.league?.name?.includes('NBA'));
      for (const game of nbaGames.slice(0, 4)) {
        const home = game.teams.home.name;
        const away = game.teams.away.name;
        const templates = [
          { question: `NBA: ${home} vs ${away} — Who wins?`, optionA: home, optionB: away },
          { question: `${home} vs ${away}: Over 220 combined points?`, optionA: 'YES', optionB: 'NO' },
        ];
        predictions.push({
          ...templates[Math.floor(Math.random() * templates.length)],
          category: 'nba', emoji: '🏀',
          expiresAt: expires(DURATION.SPORT_LIVE)
        });
      }
    }
  } catch (e) {
    console.error('NBA API error:', e.message);
  }
  return predictions;
}

async function generateNFLLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`https://v1.american-football.api-sports.io/games?date=${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response) {
      const nflGames = data.response.filter(g => g.league?.name?.includes('NFL'));
      for (const game of nflGames.slice(0, 3)) {
        const home = game.teams.home.name;
        const away = game.teams.away.name;
        predictions.push({
          question: `NFL: ${home} vs ${away} — Who wins?`,
          optionA: home, optionB: away,
          category: 'nfl', emoji: '🏈',
          expiresAt: expires(DURATION.SPORT_LIVE)
        });
      }
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

    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`https://v1.hockey.api-sports.io/games?date=${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response) {
      const nhlGames = data.response.filter(g => g.league?.name?.includes('NHL'));
      for (const game of nhlGames.slice(0, 3)) {
        const home = game.teams.home.name;
        const away = game.teams.away.name;
        predictions.push({
          question: `NHL: ${home} vs ${away} — Who wins?`,
          optionA: home, optionB: away,
          category: 'hockey', emoji: '🏒',
          expiresAt: expires(DURATION.SPORT_LIVE)
        });
      }
    }
  } catch (e) {
    console.error('Hockey API error:', e.message);
  }
  return predictions;
}

async function generateCombatLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const res = await fetch('https://v1.mma.api-sports.io/fights?next=5', {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response) {
      for (const fight of data.response.slice(0, 3)) {
        if (fight.fighters?.first?.name && fight.fighters?.second?.name) {
          const f1 = fight.fighters.first.name;
          const f2 = fight.fighters.second.name;
          const templates = [
            { question: `${f1} vs ${f2} — Who wins?`, optionA: f1, optionB: f2 },
            { question: `${f1} vs ${f2}: KO or Decision?`, optionA: 'KO/TKO', optionB: 'Decision' },
          ];
          predictions.push({
            ...templates[Math.floor(Math.random() * templates.length)],
            category: 'combat', emoji: '🥊',
            expiresAt: expires(DURATION.EVENT)
          });
        }
      }
    }
  } catch (e) {
    console.error('MMA API error:', e.message);
  }
  return predictions;
}

async function generateF1Live() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const res = await fetch('https://v1.formula-1.api-sports.io/races?next=3', {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response) {
      for (const race of data.response.slice(0, 2)) {
        const name = race.competition?.name || 'next race';
        predictions.push({
          question: `F1 ${name}: Who takes pole position?`,
          optionA: 'Verstappen', optionB: 'Someone else',
          category: 'f1', emoji: '🏎',
          expiresAt: expires(DURATION.EVENT)
        });
        predictions.push({
          question: `Safety Car at the ${name}?`,
          optionA: 'YES', optionB: 'NO',
          category: 'f1', emoji: '🏎',
          expiresAt: expires(DURATION.EVENT)
        });
      }
    }
  } catch (e) {
    console.error('F1 API error:', e.message);
  }
  return predictions;
}

async function generateRugbyLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`https://v1.rugby.api-sports.io/games?date=${today}`, {
      headers: { 'x-apisports-key': FOOTBALL_API_KEY }
    });
    const data = await res.json();

    if (data.response) {
      for (const game of data.response.slice(0, 3)) {
        const home = game.teams.home.name;
        const away = game.teams.away.name;
        predictions.push({
          question: `Rugby: ${home} vs ${away} — Who wins?`,
          optionA: home, optionB: away,
          category: 'rugby', emoji: '🏉',
          expiresAt: expires(DURATION.SPORT_LIVE)
        });
      }
    }
  } catch (e) {
    console.error('Rugby API error:', e.message);
  }
  return predictions;
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
// CRYPTO LIVE PRICE (CoinGecko - generous quota)
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
        expiresAt: expires(DURATION.CRYPTO_PRICE)
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

        // Pick a random format
        const fmt = NEWS_FORMATS[Math.floor(Math.random() * NEWS_FORMATS.length)];

        // Use bullish/bearish specifically for crypto
        const finalFmt = newsConfig.predCat === 'crypto'
          ? { suffix: ' — Bullish or bearish?', a: 'Bullish', b: 'Bearish' }
          : fmt;

        predictions.push({
          question: `"${title}"${finalFmt.suffix}`,
          optionA: finalFmt.a, optionB: finalFmt.b,
          category: newsConfig.predCat, emoji: newsConfig.emoji,
          expiresAt: expires(DURATION.NEWS)
        });
      }
    }
  } catch (e) {
    console.error(`News API error (${newsConfig.category}):`, e.message);
  }
  return pickRandom(predictions, 2);
}

// ============================================
// OPINION BACKUP (free, no API)
// ============================================

function generateOpinionPredictions(category, count) {
  const pool = OPINION_POOLS[category];
  if (!pool || pool.length === 0) return [];

  const durations = [DURATION.FLASH, DURATION.SHORT, DURATION.MEDIUM];
  return pickRandom(pool, count).map(p => ({
    ...p,
    category,
    expiresAt: expires(durations[Math.floor(Math.random() * durations.length)])
  }));
}

// ============================================
// SMART GENERATOR - Main engine
// ============================================

async function addIfNotDupe(pred, activeList) {
  const isDupe = activeList.some(e =>
    e.question.toLowerCase().includes(pred.question.toLowerCase().slice(0, 30))
  );
  if (!isDupe) {
    await db.addPrediction(pred);
    return true;
  }
  return false;
}

async function smartGenerate() {
  console.log('\n=== Smart generation cycle ===');

  const active = await db.getActivePredictions();
  let totalGenerated = 0;

  // Count per category
  const counts = {};
  for (const cat of Object.keys(MIN_SLOTS)) {
    counts[cat] = active.filter(p => p.category === cat).length;
  }
  console.log('Active counts:', JSON.stringify(counts));
  console.log(`Total active: ${active.length}`);

  // === STEP 1: API-Sports rotation ===
  const sportsToFetch = API_SPORTS_ROTATION[apiSportsCycleIndex % API_SPORTS_ROTATION.length];
  apiSportsCycleIndex++;
  console.log(`Sports rotation: [${sportsToFetch.join(', ')}]`);

  for (const sport of sportsToFetch) {
    const generator = SPORT_GENERATORS[sport];
    if (!generator) continue;
    try {
      const preds = await generator();
      for (const pred of preds) {
        if (await addIfNotDupe(pred, active)) {
          totalGenerated++;
          active.push(pred); // Track to avoid self-dupes
        }
      }
      if (preds.length > 0) {
        console.log(`  ${sport}: +${preds.length} live`);
      }
    } catch (e) {
      console.error(`  ${sport} error:`, e.message);
    }
  }

  // === STEP 2: Crypto live price (CoinGecko - always, cheap quota) ===
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

  // === STEP 3: News rotation ===
  const newsToFetch = NEWS_ROTATION[newsCycleIndex % NEWS_ROTATION.length];
  newsCycleIndex++;
  console.log(`News rotation: [${newsToFetch.map(n => n.predCat).join(', ')}]`);

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

  // === STEP 4: Fill remaining gaps with opinion backup ===
  // Recount after API additions
  const updatedCounts = {};
  for (const cat of Object.keys(MIN_SLOTS)) {
    updatedCounts[cat] = active.filter(p => p.category === cat).length;
  }

  for (const [cat, minRequired] of Object.entries(MIN_SLOTS)) {
    const deficit = minRequired - (updatedCounts[cat] || 0);
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
  console.log('Prediction scheduler started (3h cycle, smart rotation)');

  // Generate on startup
  const active = await db.getActivePredictions();
  if (active.length < 15) {
    await smartGenerate();
  }

  // Main cycle: every 3 hours
  setInterval(async () => {
    await cleanupExpired();
    await smartGenerate();
  }, 3 * 60 * 60 * 1000);

  // Hourly check: emergency fill if running low
  setInterval(async () => {
    await cleanupExpired();
    const current = await db.getActivePredictions();
    if (current.length < 10) {
      console.log('LOW CONTENT ALERT - emergency generation...');
      await smartGenerate();
    }
  }, 60 * 60 * 1000);
}

// Backward compatibility
async function generateDailyPredictions() {
  return smartGenerate();
}

// ============================================
// UTILS
// ============================================

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function expires(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

module.exports = { generateDailyPredictions, cleanupExpired, startScheduler };
