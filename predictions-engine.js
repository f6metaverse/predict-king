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
  // Sport (API-Sports) — upgraded generators produce more quality predictions
  crypto: 8,
  football: 8,
  nba: 6,
  combat: 5,
  f1: 4,
  nfl: 4,
  hockey: 6,
  rugby: 3,
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
  sports_news: 2,
  motorsport: 1,
  tennis: 1,
  golf: 1,
  combat_news: 1,
  cycling: 1,
  wrestling: 1,
  athletics: 1,
  esports: 1,
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
    { category: 'sports', qInTitle: 'transfer%20OR%20injury%20OR%20record%20OR%20retire%20OR%20sacked%20OR%20VAR', predCat: 'sports_news', emoji: '⚽', formats: 'sports' },
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
    { category: 'entertainment', qInTitle: 'box%20office%20OR%20anime%20OR%20Netflix%20OR%20Oscar%20OR%20Emmy', predCat: 'cinema', emoji: '🎬', formats: 'entertainment' },
    { category: 'technology', q: 'controversy%20OR%20scandal%20OR%20leaked%20OR%20hack%20OR%20ban', predCat: 'drama', emoji: '👀', formats: 'tech' },
    { category: 'science', q: 'space%20OR%20NASA%20OR%20discovery%20OR%20Mars%20OR%20quantum', predCat: 'science', emoji: '🔬', formats: 'science' },
    { category: 'crime', q: 'trial%20OR%20arrest%20OR%20fraud%20OR%20investigation', predCat: 'crime', emoji: '🚨', formats: 'crime' },
  ],
  // Cycle 7: Health + Trending + Crypto + Sports news
  [
    { category: 'health', q: 'fitness%20OR%20mental%20health%20OR%20diet%20OR%20wellness%20OR%20vaccine', predCat: 'health', emoji: '💪', formats: 'health' },
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥', formats: 'general', prioritydomain: 'top' },
    { endpoint: 'crypto', coin: 'btc,eth,doge,xrp', predCat: 'crypto', emoji: '₿', formats: 'crypto' },
    { category: 'sports', qInTitle: 'Formula%201%20OR%20MotoGP%20OR%20Grand%20Prix%20OR%20NASCAR%20OR%20IndyCar', predCat: 'motorsport', emoji: '🏁', formats: 'motorsport' },
  ],
  // Cycle 8: Environment + Lifestyle + Business + Tourism
  [
    { category: 'environment', q: 'climate%20OR%20pollution%20OR%20renewable%20OR%20wildfire%20OR%20flood', predCat: 'environment', emoji: '🌱', formats: 'environment' },
    { category: 'lifestyle', q: 'trend%20OR%20viral%20OR%20fashion%20OR%20wellness', predCat: 'lifestyle', emoji: '✨', formats: 'lifestyle' },
    { category: 'business', qInTitle: 'Tesla%20OR%20Amazon%20OR%20Google%20OR%20Microsoft%20OR%20Apple', predCat: 'business', emoji: '💼', formats: 'business' },
    { category: 'tourism', q: null, predCat: 'tourism', emoji: '✈️', formats: 'lifestyle' },
  ],
  // Cycle 9: French news + Drama + Food + World sentiment
  [
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥', formats: 'general', prioritydomain: 'top' },
    { category: 'technology', q: 'AI%20OR%20robot%20OR%20ChatGPT%20OR%20autonomous%20OR%20deepfake', predCat: 'drama', emoji: '🤖', formats: 'tech' },
    { category: 'food', q: 'restaurant%20OR%20chef%20OR%20recipe%20OR%20vegan%20OR%20fast%20food', predCat: 'food', emoji: '🍔', formats: 'lifestyle' },
    { category: 'world', q: null, predCat: 'world', emoji: '🌍', formats: 'general', prioritydomain: 'top' },
  ],
  // Cycle 10: EVENT HUNTER — specifically looks for upcoming events
  [
    { category: 'entertainment', q: 'premiere%20OR%20finale%20OR%20release%20OR%20ceremony%20OR%20award%20show', predCat: 'cinema', emoji: '🎬', formats: 'entertainment' },
    { category: 'entertainment', q: 'concert%20OR%20tour%20OR%20festival%20OR%20show%20OR%20live%20event', predCat: 'musique', emoji: '🎵', formats: 'entertainment' },
    { category: 'politics', q: 'summit%20OR%20debate%20OR%20election%20OR%20hearing%20OR%20vote', predCat: 'politics', emoji: '🏛', formats: 'politics' },
    { category: 'technology', q: 'launch%20OR%20keynote%20OR%20announcement%20OR%20reveal%20OR%20event', predCat: 'drama', emoji: '🚀', formats: 'tech' },
  ],
  // Cycle 11: TENNIS + GOLF + COMBAT + BUSINESS
  [
    { category: 'sports', qInTitle: 'tennis%20OR%20Wimbledon%20OR%20Roland%20Garros%20OR%20US%20Open%20OR%20ATP%20OR%20WTA%20OR%20Grand%20Slam', predCat: 'tennis', emoji: '🎾', formats: 'tennis' },
    { category: 'sports', qInTitle: 'golf%20OR%20Masters%20OR%20PGA%20OR%20Ryder%20Cup%20OR%20Open%20Championship', predCat: 'golf', emoji: '⛳', formats: 'sports' },
    { category: 'sports', qInTitle: 'boxing%20OR%20UFC%20OR%20Canelo%20OR%20title%20fight%20OR%20knockout%20OR%20weigh-in', predCat: 'combat_news', emoji: '🥊', formats: 'combat_news' },
    { category: 'business', qInTitle: 'IPO%20OR%20merger%20OR%20acquisition%20OR%20earnings', predCat: 'business', emoji: '💼', formats: 'business' },
  ],
  // Cycle 12: FOOTBALL DRAMA + MOTORSPORT + CYCLING + CRYPTO
  [
    { category: 'sports', qInTitle: 'Premier%20League%20OR%20Champions%20League%20OR%20La%20Liga%20OR%20Serie%20A%20OR%20Ligue%201', predCat: 'sports_news', emoji: '⚽', formats: 'sports' },
    { category: 'sports', qInTitle: 'F1%20OR%20Formula%201%20OR%20MotoGP%20OR%20rally%20OR%20Le%20Mans%20OR%20WRC', predCat: 'motorsport', emoji: '🏎', formats: 'motorsport' },
    { category: 'sports', qInTitle: 'Tour%20de%20France%20OR%20cycling%20OR%20Giro%20OR%20Vuelta', predCat: 'cycling', emoji: '🚴', formats: 'sports' },
    { endpoint: 'crypto', coin: 'btc,eth,sol,doge', predCat: 'crypto', emoji: '₿', formats: 'crypto' },
  ],
  // Cycle 13: NBA/NFL NEWS + WRESTLING + ATHLETICS + WORLD
  [
    { category: 'sports', qInTitle: 'NBA%20OR%20trade%20OR%20draft%20OR%20MVP%20OR%20All-Star%20OR%20playoffs', predCat: 'sports_news', emoji: '🏀', formats: 'sports' },
    { category: 'sports', qInTitle: 'WWE%20OR%20WrestleMania%20OR%20Royal%20Rumble%20OR%20AEW', predCat: 'wrestling', emoji: '💪', formats: 'combat_news' },
    { category: 'sports', qInTitle: 'Olympic%20OR%20marathon%20OR%20sprint%20OR%20world%20record%20OR%20swimming', predCat: 'athletics', emoji: '🏃', formats: 'sports' },
    { category: 'world', q: 'summit%20OR%20treaty%20OR%20sanctions%20OR%20crisis%20OR%20agreement', predCat: 'world', emoji: '🌍', formats: 'general', prioritydomain: 'top' },
  ],
  // Cycle 14: ESPORTS + COMBAT + TENNIS + TRENDING
  [
    { category: 'sports', qInTitle: 'esports%20OR%20League%20of%20Legends%20OR%20Valorant%20OR%20Counter-Strike%20OR%20Worlds', predCat: 'esports', emoji: '🕹', formats: 'sports' },
    { category: 'sports', qInTitle: 'UFC%20OR%20MMA%20OR%20fight%20card%20OR%20weigh-in%20OR%20title%20bout', predCat: 'combat_news', emoji: '🥊', formats: 'combat_news' },
    { category: 'sports', qInTitle: 'tennis%20OR%20Australian%20Open%20OR%20final%20OR%20seed%20OR%20upset', predCat: 'tennis', emoji: '🎾', formats: 'tennis' },
    { category: 'top', q: null, predCat: 'trending', emoji: '🔥', formats: 'general', prioritydomain: 'top' },
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
    { suffix: ' — GOAT move or overrated?', a: 'GOAT move', b: 'Overrated' },
    { suffix: ' — Will they pull it off?', a: 'YES, lock it in', b: 'NO chance' },
    { suffix: ' — Historic or forgotten by next week?', a: 'Historic', b: 'Forgotten' },
    { suffix: ' — Underdog story incoming?', a: 'Underdog wins', b: 'Favorite cruises' },
    { suffix: ' — Will this break a record?', a: 'Record broken', b: 'Not even close' },
    { suffix: ' — Comeback or it\'s over?', a: 'Comeback loading', b: 'It\'s a wrap' },
  ],
  motorsport: [
    { suffix: ' — Will this shake up the standings?', a: 'Standings shaken', b: 'No change' },
    { suffix: ' — Podium or disaster?', a: 'Podium finish', b: 'Disaster race' },
    { suffix: ' — Best race of the season?', a: 'Instant classic', b: 'Boring race' },
    { suffix: ' — Will there be a crash?', a: 'Drama incoming', b: 'Clean race' },
    { suffix: ' — Team orders controversy?', a: 'Controversy alert', b: 'Fair racing' },
    { suffix: ' — Rookie surprise?', a: 'Rookie shines', b: 'Veterans dominate' },
  ],
  tennis: [
    { suffix: ' — Upset incoming?', a: 'Upset happens', b: 'Favorite wins' },
    { suffix: ' — Straight sets or a battle?', a: 'Straight sets', b: 'Epic 5-setter' },
    { suffix: ' — GOAT debate material?', a: 'GOAT moment', b: 'Just another match' },
    { suffix: ' — Will the crowd factor matter?', a: 'Crowd decides it', b: 'No effect' },
    { suffix: ' — New era or same dominance?', a: 'New era', b: 'Same old story' },
  ],
  combat_news: [
    { suffix: ' — Fight of the year?', a: 'FOTY contender', b: 'Forgettable' },
    { suffix: ' — KO or distance?', a: 'Early KO', b: 'Goes the distance' },
    { suffix: ' — Upset on the cards?', a: 'Upset incoming', b: 'No chance' },
    { suffix: ' — Will it live up to the hype?', a: 'Exceeds the hype', b: 'Overhyped' },
    { suffix: ' — Rematch needed?', a: 'Run it back', b: 'Clear winner' },
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

// Football league tiers for prioritization
// TIER 1: Elite competitions — always show first, get 2 predictions each
const FOOTBALL_TIER_1 = [
  2,    // Champions League
  3,    // Europa League
  1,    // World Cup
  4,    // Euro Championship
  39,   // Premier League (England)
  140,  // La Liga (Spain)
  135,  // Serie A (Italy)
  78,   // Bundesliga (Germany)
  61,   // Ligue 1 (France)
];

// TIER 2: Strong leagues/tournaments — fill after tier 1
const FOOTBALL_TIER_2 = [
  13,   // Copa Libertadores
  5,    // UEFA Nations League
  9,    // Copa America
  6,    // Africa Cup of Nations
  88,   // Eredivisie (Netherlands)
  262,  // Liga MX (Mexico)
  71,   // Serie A (Brazil)
  94,   // Primeira Liga (Portugal)
  144,  // Jupiler Pro League (Belgium)
  203,  // Super Lig (Turkey)
  307,  // Saudi Pro League
  253,  // MLS (USA)
];

// TIER 3: Everything else that's still a known league
const FOOTBALL_TIER_3 = [
  848,  // Conference League
  531,  // UEFA Super Cup
  128,  // Liga Profesional (Argentina)
  10,   // Friendlies (international)
  37,   // World Cup Qualification Playoffs
  29,   // World Cup Qualification Africa
  30,   // World Cup Qualification Asia
  31,   // World Cup Qualification CONCACAF
  32,   // World Cup Qualification Europe
  34,   // World Cup Qualification South America
  536,  // CONCACAF Nations League
  960,  // Euro Qualification
  1222, // FIFA Series
  1207, // CONCACAF Series
  11,   // Copa Sudamericana
  12,   // CAF Champions League
  17,   // AFC Champions League
  15,   // FIFA Club World Cup
];

// Combined list for filtering known leagues
const TOP_FOOTBALL_LEAGUES = [...FOOTBALL_TIER_1, ...FOOTBALL_TIER_2, ...FOOTBALL_TIER_3];

// Returns 0 for tier 1, 1 for tier 2, 2 for tier 3, 3 for unknown
function getFootballTier(leagueId) {
  if (FOOTBALL_TIER_1.includes(leagueId)) return 0;
  if (FOOTBALL_TIER_2.includes(leagueId)) return 1;
  if (FOOTBALL_TIER_3.includes(leagueId)) return 2;
  return 3;
}

async function generateFootballLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const dates = getNextDays(6); // 7 days ahead — top leagues play mostly on weekends
    const season = getCurrentSeason();
    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };

    // Free plan doesn't support current season — fetch by date only
    const allMatches = [];
    for (const date of dates) {
      try {
        const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}`, { headers });
        const data = await res.json();
        if (data.response && Array.isArray(data.response)) {
          allMatches.push(...data.response);
        }
      } catch (e) {
        console.error(`Football fetch error for ${date}:`, e.message);
      }
    }
    console.log(`    Football: ${allMatches.length} total fixtures found across ${dates.length} days`);

    if (allMatches.length === 0) return predictions;

    // Only upcoming matches (not started/finished)
    const upcoming = allMatches.filter(m =>
      m.fixture?.status?.short === 'NS' || m.fixture?.status?.short === 'TBD'
    );

    // Sort by tier: TIER 1 first, then TIER 2, then TIER 3, then unknown
    upcoming.sort((a, b) => getFootballTier(a.league?.id) - getFootballTier(b.league?.id));

    // Take top 8 matches after tier sorting
    for (const match of upcoming.slice(0, 8)) {
      const home = match.teams.home.name;
      const away = match.teams.away.name;
      const league = match.league.name;
      const kickoff = match.fixture.date;
      const fixtureId = match.fixture.id;
      const dateStr = formatMatchDate(kickoff);
      const tier = getFootballTier(match.league?.id);

      const baseMetadata = {
        fixtureId,
        kickoff,
        apiType: 'football',
        homeTeam: home,
        awayTeam: away,
        leagueId: match.league?.id,
        leagueName: league
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

      if (tier === 0) {
        // TIER 1: generate 2 predictions (winner + over/under goals)
        predictions.push({
          ...templates[0],
          category: 'football', emoji: '⚽',
          expiresAt: expiresAtKickoff(kickoff)
        });
        predictions.push({
          ...templates[1],
          category: 'football', emoji: '⚽',
          expiresAt: expiresAtKickoff(kickoff)
        });
      } else {
        // TIER 2/3/unknown: generate 1 random prediction
        predictions.push({
          ...templates[Math.floor(Math.random() * templates.length)],
          category: 'football', emoji: '⚽',
          expiresAt: expiresAtKickoff(kickoff)
        });
      }
    }
  } catch (e) {
    console.error('Football API error:', e.message);
  }
  // Return ALL predictions (no pickRandom) — up to ~12
  return predictions;
}

async function generateNBALive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };
    const dates = getNextDays(6); // 7 days ahead — full week Monday to Sunday

    // Big market teams for prioritization
    const NBA_BIG_MARKET = ['Los Angeles Lakers', 'Golden State Warriors', 'Boston Celtics', 'New York Knicks', 'Brooklyn Nets', 'Miami Heat', 'Philadelphia 76ers', 'Dallas Mavericks', 'Milwaukee Bucks', 'Phoenix Suns', 'Denver Nuggets', 'Chicago Bulls', 'Cleveland Cavaliers', 'Minnesota Timberwolves', 'Oklahoma City Thunder', 'Sacramento Kings'];

    // Fetch next 7 days of games
    const allGames = [];
    for (const date of dates) {
      try {
        const res = await fetch(`https://v1.basketball.api-sports.io/games?date=${date}`, { headers });
        const data = await res.json();
        if (data.response) {
          const nbaGames = data.response.filter(g =>
            g.league?.name === 'NBA' &&
            (g.status?.short === 'NS' || g.status?.short === null)
          );
          allGames.push(...nbaGames);
        }
      } catch (e) {
        console.error(`NBA fetch error for ${date}:`, e.message);
      }
    }

    // Sort by big market matchups: 2 big market teams > 1 > 0
    allGames.sort((a, b) => {
      const aScore = (NBA_BIG_MARKET.includes(a.teams?.home?.name) ? 1 : 0) + (NBA_BIG_MARKET.includes(a.teams?.away?.name) ? 1 : 0);
      const bScore = (NBA_BIG_MARKET.includes(b.teams?.home?.name) ? 1 : 0) + (NBA_BIG_MARKET.includes(b.teams?.away?.name) ? 1 : 0);
      return bScore - aScore; // Higher score first
    });

    // Take top 8 games after sorting
    for (const game of allGames.slice(0, 8)) {
      const home = game.teams.home.name;
      const away = game.teams.away.name;
      const kickoff = game.date || game.time;
      const gameId = game.id;
      const dateStr = kickoff ? formatMatchDate(kickoff) : dates[0];

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

      const isBigMatchup = NBA_BIG_MARKET.includes(home) && NBA_BIG_MARKET.includes(away);

      if (isBigMatchup) {
        // Big matchup (2 big market teams): generate both predictions
        for (const tmpl of templates) {
          predictions.push({
            ...tmpl,
            category: 'nba', emoji: '🏀',
            expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(48)
          });
        }
      } else {
        // Other games: generate 1 random prediction
        predictions.push({
          ...templates[Math.floor(Math.random() * templates.length)],
          category: 'nba', emoji: '🏀',
          expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(48)
        });
      }
    }
  } catch (e) {
    console.error('NBA API error:', e.message);
  }
  // Return ALL predictions (no pickRandom) — up to ~12
  return predictions;
}

async function generateNFLLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };
    const dates = getNextDays(6); // 7 days ahead — NFL games are Sun + Mon night

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

    // Take up to 8 games
    for (let i = 0; i < Math.min(allGames.length, 8); i++) {
      const game = allGames[i];
      const home = game.teams.home.name;
      const away = game.teams.away.name;
      const kickoff = game.date || game.time;
      const gameId = game.id;
      const dateStr = kickoff ? formatMatchDate(kickoff) : 'This week';

      const baseMetadata = {
        gameId, kickoff, apiType: 'american-football',
        homeTeam: home, awayTeam: away
      };

      const winnerPred = {
        question: `🏈 NFL: ${home} vs ${away} — Who wins? (${dateStr})`,
        optionA: home, optionB: away,
        category: 'nfl', emoji: '🏈',
        expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72),
        metadata: { ...baseMetadata, predType: 'winner' }
      };

      const overUnderPred = {
        question: `🏈 ${home} vs ${away}: Over 45 combined points? (${dateStr})`,
        optionA: 'YES', optionB: 'NO',
        category: 'nfl', emoji: '🏈',
        expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72),
        metadata: { ...baseMetadata, predType: 'over_points', threshold: 45 }
      };

      if (i < 2) {
        // First 2 games (primetime/important): generate both templates
        predictions.push(winnerPred);
        predictions.push(overUnderPred);
      } else {
        // Remaining games: 1 random template
        predictions.push(Math.random() < 0.5 ? winnerPred : overUnderPred);
      }
    }
  } catch (e) {
    console.error('NFL API error:', e.message);
  }
  // Return ALL predictions (no pickRandom) — up to ~10
  return predictions;
}

async function generateHockeyLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };
    const dates = getNextDays(6); // 7 days ahead — full week Monday to Sunday

    const allGames = [];
    for (const date of dates) {
      try {
        const res = await fetch(`https://v1.hockey.api-sports.io/games?date=${date}`, { headers });
        const data = await res.json();
        if (data.response) {
          const hockeyGames = data.response.filter(g =>
            (g.league?.name === 'NHL' || g.league?.name === 'KHL') &&
            (g.status?.short === 'NS' || !g.status?.short)
          );
          allGames.push(...hockeyGames);
        }
      } catch (e) {
        console.error(`Hockey fetch error for ${date}:`, e.message);
      }
    }

    // Sort: NHL first (way more popular), KHL second
    const nhlGames = allGames.filter(g => g.league?.name === 'NHL');
    const khlGames = allGames.filter(g => g.league?.name === 'KHL');

    // Take up to 6 NHL + 2 KHL = 8 games max
    const selectedGames = [
      ...nhlGames.slice(0, 6),
      ...khlGames.slice(0, 2)
    ];

    for (let i = 0; i < selectedGames.length; i++) {
      const game = selectedGames[i];
      const home = game.teams.home.name;
      const away = game.teams.away.name;
      const kickoff = game.date || game.time;
      const gameId = game.id;
      const leagueName = game.league?.name || 'Hockey';
      const dateStr = kickoff ? formatMatchDate(kickoff) : 'This week';
      const isNHL = game.league?.name === 'NHL';

      const baseMetadata = {
        gameId, kickoff, apiType: 'hockey',
        homeTeam: home, awayTeam: away, league: leagueName
      };

      const winnerPred = {
        question: `🏒 ${leagueName}: ${home} vs ${away} — Who wins? (${dateStr})`,
        optionA: home, optionB: away,
        category: 'hockey', emoji: '🏒',
        expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(48),
        metadata: { ...baseMetadata, predType: 'winner' }
      };

      const overGoalsPred = {
        question: `🏒 ${leagueName}: ${home} vs ${away} — Over 5.5 total goals? (${dateStr})`,
        optionA: 'YES', optionB: 'NO',
        category: 'hockey', emoji: '🏒',
        expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(48),
        metadata: { ...baseMetadata, predType: 'over_goals', threshold: 5.5 }
      };

      // First 3 NHL games: generate BOTH prediction types
      if (isNHL && i < 3) {
        predictions.push(winnerPred);
        predictions.push(overGoalsPred);
      } else {
        // Rest: 1 random template
        predictions.push(Math.random() < 0.5 ? winnerPred : overGoalsPred);
      }
    }
  } catch (e) {
    console.error('Hockey API error:', e.message);
  }
  // Return ALL predictions (no pickRandom) — up to ~11 predictions
  return predictions;
}

async function generateCombatLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    // 6 days ahead — UFC cards are mostly Saturday night
    const headers2 = { 'x-apisports-key': FOOTBALL_API_KEY };
    const mmaAllFights = [];
    const mmaDates = getNextDays(5); // 6 days ahead — UFC cards are mostly Saturday
    for (const date of mmaDates) {
      try {
        const res = await fetch(`https://v1.mma.api-sports.io/fights?date=${date}`, { headers: headers2 });
        const data = await res.json();
        if (data.response && Array.isArray(data.response)) {
          mmaAllFights.push(...data.response);
        }
        if (data.errors && Object.keys(data.errors).length > 0) {
          console.error('MMA API errors:', JSON.stringify(data.errors));
          break;
        }
      } catch (e) {
        console.error(`MMA fetch error for ${date}:`, e.message);
      }
    }

    // Filter out cancelled/finished fights, keep only upcoming
    const activeFights = mmaAllFights.filter(f =>
      f.fighters?.first?.name && f.fighters?.second?.name &&
      f.status?.short !== 'CANC' && f.status?.short !== 'FT' &&
      f.status?.short !== 'POST'
    );

    // Smart ranking: main events first, then main card (later times), then prelims
    // UFC cards: prelims = early times, main card = later times, main event = is_main
    const rankedFights = [...activeFights].sort((a, b) => {
      // 1) Main event ALWAYS first
      if (a.is_main && !b.is_main) return -1;
      if (!a.is_main && b.is_main) return 1;
      // 2) Later fights = higher on the card (main card > prelims)
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return timeB - timeA;
    });

    // Take top 8 fights (main event + co-main + main card)
    const topFights = rankedFights.slice(0, 8);
    const eventName = topFights[0]?.slug || '';

    for (const fight of topFights) {
      const f1 = fight.fighters.first.name;
      const f2 = fight.fighters.second.name;
      const kickoff = fight.date;
      const fightId = fight.id;
      const weightClass = fight.category || '';
      const dateStr = kickoff ? formatMatchDate(kickoff) : 'Coming soon';
      const isMain = fight.is_main;

      const baseMetadata = {
        fightId, kickoff, apiType: 'mma',
        fighter1: f1, fighter2: f2,
        weightClass, isMain, eventName
      };

      // Main event gets BOTH question types (winner + method)
      // Other fights get one random type
      if (isMain) {
        predictions.push({
          question: `🥊 MAIN EVENT: ${f1} vs ${f2} — Who wins? (${dateStr})`,
          optionA: f1, optionB: f2,
          metadata: { ...baseMetadata, predType: 'winner' },
          category: 'combat', emoji: '🥊',
          expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72)
        });
        predictions.push({
          question: `🥊 ${f1} vs ${f2}: KO/TKO or Goes to Decision? (${dateStr})`,
          optionA: 'KO/TKO/Sub', optionB: 'Decision',
          metadata: { ...baseMetadata, predType: 'method' },
          category: 'combat', emoji: '🥊',
          expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72)
        });
        predictions.push({
          question: `🥊 ${f1} vs ${f2} — Over or Under 2.5 rounds? (${dateStr})`,
          optionA: 'Under 2.5', optionB: 'Over 2.5',
          metadata: { ...baseMetadata, predType: 'rounds' },
          category: 'combat', emoji: '🥊',
          expiresAt: kickoff ? expiresAtKickoff(kickoff) : expiresInHours(72)
        });
      } else {
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
  // Main event predictions (up to 3) + pick 4 from the rest = up to 7 combat predictions
  const mainPreds = predictions.filter(p => p.metadata?.isMain);
  const otherPreds = predictions.filter(p => !p.metadata?.isMain);
  return [...mainPreds, ...pickRandom(otherPreds, 4)];
}

// Hardcoded 2026 F1 calendar (API doesn't provide race dates on free plan)
const F1_CALENDAR_2026 = [
  { name: 'Australian Grand Prix', month: 3, day: 14 },
  { name: 'Chinese Grand Prix', month: 3, day: 28 },
  { name: 'Japanese Grand Prix', month: 4, day: 11 },
  { name: 'Bahrain Grand Prix', month: 4, day: 18 },
  { name: 'Saudi Arabian Grand Prix', month: 5, day: 2 },
  { name: 'Miami Grand Prix', month: 5, day: 16 },
  { name: 'Emilia Romagna Grand Prix', month: 5, day: 30 },
  { name: 'Monaco Grand Prix', month: 6, day: 6 },
  { name: 'Spanish Grand Prix', month: 6, day: 20 },
  { name: 'Canadian Grand Prix', month: 7, day: 4 },
  { name: 'Austrian Grand Prix', month: 7, day: 18 },
  { name: 'British Grand Prix', month: 8, day: 1 },
  { name: 'Belgian Grand Prix', month: 8, day: 29 },
  { name: 'Dutch Grand Prix', month: 9, day: 5 },
  { name: 'Italian Grand Prix', month: 9, day: 12 },
  { name: 'Azerbaijan Grand Prix', month: 9, day: 26 },
  { name: 'Singapore Grand Prix', month: 10, day: 10 },
  { name: 'United States Grand Prix', month: 10, day: 24 },
  { name: 'Mexico City Grand Prix', month: 10, day: 31 },
  { name: 'Brazilian Grand Prix', month: 11, day: 14 },
  { name: 'Las Vegas Grand Prix', month: 11, day: 21 },
  { name: 'Qatar Grand Prix', month: 12, day: 5 },
  { name: 'Abu Dhabi Grand Prix', month: 12, day: 12 },
];

// ============================================
// F1 NEWS-POWERED GENERATOR
// Parses F1 news articles to extract drivers, teams, GP context
// and generates engaging fan-focused predictions
// ============================================

// F1 2026 drivers — detect names in article titles/keywords
const F1_DRIVERS = [
  { name: 'Verstappen', full: 'Max Verstappen', team: 'Red Bull' },
  { name: 'Hamilton', full: 'Lewis Hamilton', team: 'Ferrari' },
  { name: 'Leclerc', full: 'Charles Leclerc', team: 'Ferrari' },
  { name: 'Norris', full: 'Lando Norris', team: 'McLaren' },
  { name: 'Piastri', full: 'Oscar Piastri', team: 'McLaren' },
  { name: 'Russell', full: 'George Russell', team: 'Mercedes' },
  { name: 'Antonelli', full: 'Kimi Antonelli', team: 'Mercedes' },
  { name: 'Alonso', full: 'Fernando Alonso', team: 'Aston Martin' },
  { name: 'Stroll', full: 'Lance Stroll', team: 'Aston Martin' },
  { name: 'Gasly', full: 'Pierre Gasly', team: 'Alpine' },
  { name: 'Doohan', full: 'Jack Doohan', team: 'Alpine' },
  { name: 'Sainz', full: 'Carlos Sainz', team: 'Williams' },
  { name: 'Albon', full: 'Alex Albon', team: 'Williams' },
  { name: 'Tsunoda', full: 'Yuki Tsunoda', team: 'RB' },
  { name: 'Lawson', full: 'Liam Lawson', team: 'Red Bull' },
  { name: 'Hulkenberg', full: 'Nico Hulkenberg', team: 'Sauber' },
  { name: 'Bortoleto', full: 'Gabriel Bortoleto', team: 'Sauber' },
  { name: 'Ocon', full: 'Esteban Ocon', team: 'Haas' },
  { name: 'Bearman', full: 'Oliver Bearman', team: 'Haas' },
  { name: 'Hadjar', full: 'Isack Hadjar', team: 'RB' },
];

// F1 teams for detection
const F1_TEAMS = [
  'Red Bull', 'Ferrari', 'McLaren', 'Mercedes', 'Aston Martin',
  'Alpine', 'Williams', 'RB', 'Sauber', 'Haas'
];

// GP name aliases for detection in article text
const GP_ALIASES = {
  'Australian': ['australia', 'melbourne', 'albert park'],
  'Chinese': ['china', 'shanghai'],
  'Japanese': ['japan', 'suzuka'],
  'Bahrain': ['bahrain', 'sakhir'],
  'Saudi Arabian': ['saudi', 'jeddah'],
  'Miami': ['miami'],
  'Emilia Romagna': ['imola', 'emilia'],
  'Monaco': ['monaco', 'monte carlo'],
  'Spanish': ['spain', 'barcelona', 'spanish'],
  'Canadian': ['canada', 'montreal'],
  'Austrian': ['austria', 'spielberg', 'red bull ring'],
  'British': ['silverstone', 'british'],
  'Belgian': ['spa', 'belgian', 'belgium'],
  'Dutch': ['zandvoort', 'dutch', 'netherlands'],
  'Italian': ['monza', 'italian'],
  'Azerbaijan': ['baku', 'azerbaijan'],
  'Singapore': ['singapore', 'marina bay'],
  'United States': ['austin', 'cota', 'united states gp'],
  'Mexico City': ['mexico'],
  'Brazilian': ['interlagos', 'brazil', 'sao paulo'],
  'Las Vegas': ['las vegas', 'vegas'],
  'Qatar': ['qatar', 'lusail'],
  'Abu Dhabi': ['abu dhabi', 'yas marina'],
};

async function generateF1Live() {
  const predictions = [];
  try {
    if (!NEWS_API_KEY) return predictions;

    // Step 1: Find the next GP from the hardcoded calendar
    const now = new Date();
    const nextRace = F1_CALENDAR_2026.find(race => {
      const raceDate = new Date(Date.UTC(2026, race.month - 1, race.day, 13, 0));
      return raceDate > now;
    });

    if (!nextRace) {
      console.log('    F1: No upcoming races left in 2026 calendar');
      return predictions;
    }

    const raceDate = new Date(Date.UTC(2026, nextRace.month - 1, nextRace.day, 13, 0));
    const expiry = raceDate.toISOString();
    const gpShort = nextRace.name.replace(' Grand Prix', '');
    const gpName = nextRace.name;

    console.log(`    F1: Next race = ${gpName} (${raceDate.toISOString().split('T')[0]})`);

    // Step 2: Fetch F1 news from NewsData
    const url = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&language=en&category=sports&qInTitle=F1%20OR%20Formula%201%20OR%20Grand%20Prix%20OR%20${encodeURIComponent(gpShort)}&removeduplicate=1`;
    const res = await fetch(url);
    const data = await res.json();

    const articles = (data.results || []).filter(a => a.title && a.title.length >= 15);
    console.log(`    F1: ${articles.length} news articles found`);

    // Step 3: Parse all articles — count driver/team mentions
    const driverMentions = {};
    const teamMentions = {};
    let gpConfirmed = gpName; // default to calendar

    const allText = articles.map(a =>
      `${a.title} ${a.description || ''} ${(a.keywords || []).join(' ')}`
    ).join(' ').toLowerCase();

    // Detect GP from news (confirm it matches the calendar)
    for (const [gp, aliases] of Object.entries(GP_ALIASES)) {
      if (aliases.some(alias => allText.includes(alias))) {
        if (gpName.toLowerCase().includes(gp.toLowerCase())) {
          gpConfirmed = gpName;
          break;
        }
      }
    }

    // Count driver mentions across all articles
    for (const driver of F1_DRIVERS) {
      const nameLC = driver.name.toLowerCase();
      const fullLC = driver.full.toLowerCase();
      let count = 0;
      for (const article of articles) {
        const text = `${article.title} ${article.description || ''} ${(article.keywords || []).join(' ')}`.toLowerCase();
        if (text.includes(nameLC) || text.includes(fullLC)) count++;
      }
      if (count > 0) driverMentions[driver.name] = { ...driver, count };
    }

    // Count team mentions
    for (const team of F1_TEAMS) {
      const teamLC = team.toLowerCase();
      let count = 0;
      for (const article of articles) {
        const text = `${article.title} ${article.description || ''} ${(article.keywords || []).join(' ')}`.toLowerCase();
        if (text.includes(teamLC)) count++;
      }
      if (count > 0) teamMentions[team] = count;
    }

    // Sort drivers and teams by mentions (most talked about = most relevant)
    const topDrivers = Object.values(driverMentions).sort((a, b) => b.count - a.count);
    const topTeams = Object.entries(teamMentions).sort((a, b) => b[1] - a[1]).map(([name]) => name);

    console.log(`    F1: Top drivers in news: ${topDrivers.slice(0, 5).map(d => `${d.name}(${d.count})`).join(', ')}`);
    console.log(`    F1: Top teams in news: ${topTeams.slice(0, 3).join(', ')}`);

    const baseMetadata = {
      apiType: 'formula-1',
      source: 'newsdata',
      raceName: gpConfirmed,
      raceDate: expiry
    };

    // Step 4: Generate predictions based on news context

    // --- PREDICTION 1: Race winner — top 2 most mentioned drivers ---
    if (topDrivers.length >= 2) {
      const d1 = topDrivers[0];
      const d2 = topDrivers[1];
      predictions.push({
        question: `🏎 ${gpConfirmed}: ${d1.full} vs ${d2.full} — Who finishes ahead?`,
        optionA: d1.name, optionB: d2.name,
        category: 'f1', emoji: '🏎',
        expiresAt: expiry,
        metadata: { ...baseMetadata, predType: 'head_to_head', driver1: d1.full, driver2: d2.full }
      });
    }

    // --- PREDICTION 2: Podium for a hot driver (3rd or 4th most mentioned) ---
    if (topDrivers.length >= 3) {
      const podiumDriver = topDrivers[2];
      predictions.push({
        question: `🏎 ${gpConfirmed}: ${podiumDriver.full} on the podium?`,
        optionA: 'YES — Podium', optionB: 'NO — Misses out',
        category: 'f1', emoji: '🏎',
        expiresAt: expiry,
        metadata: { ...baseMetadata, predType: 'podium', driver: podiumDriver.full }
      });
    }

    // --- PREDICTION 3: Team battle — top 2 teams ---
    if (topTeams.length >= 2) {
      predictions.push({
        question: `🏎 ${gpConfirmed}: ${topTeams[0]} vs ${topTeams[1]} — Best team this weekend?`,
        optionA: topTeams[0], optionB: topTeams[1],
        category: 'f1', emoji: '🏎',
        expiresAt: expiry,
        metadata: { ...baseMetadata, predType: 'team_battle', team1: topTeams[0], team2: topTeams[1] }
      });
    }

    // --- PREDICTION 4: Pole position for top driver ---
    if (topDrivers.length >= 1) {
      predictions.push({
        question: `🏎 ${gpConfirmed} Qualifying: Pole position for ${topDrivers[0].full}?`,
        optionA: 'YES — P1', optionB: 'NO — Someone else',
        category: 'f1', emoji: '🏎',
        expiresAt: expiry,
        metadata: { ...baseMetadata, predType: 'pole', driver: topDrivers[0].full }
      });
    }

    // --- PREDICTION 5: Teammate battle (same team, both mentioned in news) ---
    const teamDriverPairs = {};
    for (const d of topDrivers) {
      if (!teamDriverPairs[d.team]) teamDriverPairs[d.team] = [];
      teamDriverPairs[d.team].push(d);
    }
    for (const [team, drivers] of Object.entries(teamDriverPairs)) {
      if (drivers.length >= 2) {
        predictions.push({
          question: `🏎 ${gpConfirmed}: ${team} internal battle — ${drivers[0].name} or ${drivers[1].name}?`,
          optionA: drivers[0].name, optionB: drivers[1].name,
          category: 'f1', emoji: '🏎',
          expiresAt: expiry,
          metadata: { ...baseMetadata, predType: 'teammate_battle', team, driver1: drivers[0].full, driver2: drivers[1].full }
        });
        break; // Only 1 teammate battle
      }
    }

    // --- PREDICTION 6: Race drama (always fun, always engaging) ---
    const dramaTemplates = [
      { q: `🏎 ${gpConfirmed}: Safety Car during the race?`, a: 'YES', b: 'NO', type: 'safety_car' },
      { q: `🏎 ${gpConfirmed}: Any DNF in the top 5?`, a: 'YES — Drama', b: 'NO — Clean race', type: 'dnf' },
      { q: `🏎 ${gpConfirmed}: First lap contact?`, a: 'YES — Chaos', b: 'NO — Clean start', type: 'first_lap' },
    ];
    const drama = dramaTemplates[Math.floor(Math.random() * dramaTemplates.length)];
    predictions.push({
      question: drama.q,
      optionA: drama.a, optionB: drama.b,
      category: 'f1', emoji: '🏎',
      expiresAt: expiry,
      metadata: { ...baseMetadata, predType: drama.type }
    });

    // If not enough drivers found in news, add generic GP predictions as fallback
    if (topDrivers.length < 2) {
      console.log('    F1: Not enough driver data from news, adding generic templates');
      const fallbacks = [
        { q: `🏎 ${gpConfirmed}: Will the polesitter win the race?`, a: 'YES', b: 'NO', type: 'pole_wins' },
        { q: `🏎 ${gpConfirmed}: Podium surprise from a midfield team?`, a: 'YES — Surprise', b: 'NO — Top teams only', type: 'surprise_podium' },
        { q: `🏎 ${gpConfirmed}: Over 1 pit stop strategy for the winner?`, a: 'Multi-stop', b: '1-stop', type: 'pit_strategy' },
      ];
      for (const fb of fallbacks) {
        predictions.push({
          question: fb.q,
          optionA: fb.a, optionB: fb.b,
          category: 'f1', emoji: '🏎',
          expiresAt: expiry,
          metadata: { ...baseMetadata, predType: fb.type }
        });
      }
    }

    console.log(`    F1: ${predictions.length} predictions generated for ${gpConfirmed}`);
  } catch (e) {
    console.error('F1 news engine error:', e.message);
  }
  return predictions;
}

async function generateRugbyLive() {
  const predictions = [];
  try {
    if (!FOOTBALL_API_KEY) return predictions;

    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };
    const dates = getNextDays(6); // 7 days ahead — rugby matches are mostly Fri-Sun

    // Top rugby leagues to prioritize (already good sorting)
    const TOP_RUGBY_LEAGUES = [
      16,  // Top 14 (France)
      48,  // Premiership (England)
      76,  // United Rugby Championship (Pro14)
      71,  // Super Rugby (Southern hemisphere)
      44,  // Major League Rugby (USA)
      27,  // Top League (Japan)
      12,  // Greene King IPA Championship (England 2nd)
      13,  // Premiership Rugby
    ];

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

    // Prioritize top leagues first
    const topGames = allGames.filter(g => TOP_RUGBY_LEAGUES.includes(g.league?.id));
    const otherGames = allGames.filter(g => !TOP_RUGBY_LEAGUES.includes(g.league?.id));
    const sortedGames = [...topGames, ...otherGames];

    // Take top 6 games after sorting by league priority
    const selectedGames = sortedGames.slice(0, 6);

    for (let i = 0; i < selectedGames.length; i++) {
      const game = selectedGames[i];
      const home = game.teams.home.name;
      const away = game.teams.away.name;
      const kickoff = game.date || game.time;
      const gameId = game.id;
      const dateStr = kickoff ? formatMatchDate(kickoff) : 'This week';
      const expiry = kickoff ? expiresAtKickoff(kickoff) : expiresInHours(48);

      const leagueName = game.league?.name || 'Rugby';
      const leagueId = game.league?.id;

      const baseMetadata = {
        gameId, kickoff, apiType: 'rugby',
        homeTeam: home, awayTeam: away,
        leagueId,
        leagueName
      };

      // Winner template
      const winnerPred = {
        question: `🏉 Rugby: ${home} vs ${away} — Who wins? (${dateStr})`,
        optionA: home, optionB: away,
        category: 'rugby', emoji: '🏉',
        expiresAt: expiry,
        metadata: { ...baseMetadata, predType: 'winner' }
      };

      // Margin template
      const marginPred = {
        question: `🏉 ${home} vs ${away}: Winning margin over 10 points? (${dateStr})`,
        optionA: 'YES', optionB: 'NO',
        category: 'rugby', emoji: '🏉',
        expiresAt: expiry,
        metadata: { ...baseMetadata, predType: 'margin' }
      };

      // Top 2 games (best leagues): both templates
      if (i < 2) {
        predictions.push(winnerPred);
        predictions.push(marginPred);
      } else {
        // Rest: 1 random template
        predictions.push(Math.random() < 0.5 ? winnerPred : marginPred);
      }
    }
  } catch (e) {
    console.error('Rugby API error:', e.message);
  }
  // Return ALL predictions (no pickRandom) — up to ~8 predictions
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
// CRYPTO LIVE PRICE (CoinGecko)
// ============================================

async function generateCryptoLive() {
  const predictions = [];
  try {
    // Fetch 15 top coins with full market data
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&sparkline=false&price_change_percentage=1h%2C24h%2C7d';
    const headers = COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {};
    const res = await fetch(url, { headers });
    const marketData = await res.json();
    console.log(`  Crypto markets API: ${Array.isArray(marketData) ? marketData.length + ' coins fetched' : 'ERROR: ' + JSON.stringify(marketData).slice(0, 200)}`);

    if (!Array.isArray(marketData) || marketData.length === 0) return predictions;

    // === COIN TIERS — Kings always show up ===
    const TIER_1 = ['bitcoin', 'ethereum']; // Always 3 predictions each
    const TIER_2 = ['solana', 'ripple', 'dogecoin', 'cardano', 'tron']; // 1-2 predictions
    const TIER_3_IDS = ['avalanche-2', 'chainlink', 'polkadot', 'pepe', 'shiba-inu', 'sui', 'near', 'litecoin']; // 1 prediction if interesting

    const EMOJI_MAP = {
      bitcoin: '₿', ethereum: '💎', solana: '⚡', dogecoin: '🐕', ripple: '💧',
      cardano: '🔷', tron: '🔮', 'avalanche-2': '🔺', chainlink: '🔗', polkadot: '⚪',
      pepe: '🐸', 'shiba-inu': '🐶', sui: '🌊', near: '🌐', litecoin: '🪙'
    };

    function formatPrice(price) {
      if (price >= 10000) return '$' + Math.round(price).toLocaleString();
      if (price >= 1) return '$' + price.toFixed(2);
      if (price >= 0.001) return '$' + price.toFixed(4);
      return '$' + price.toFixed(8);
    }

    function getTarget(price, change24h, direction) {
      // Dynamic targets based on current momentum
      const momentum = Math.abs(change24h || 0);
      const volatilityMult = momentum > 10 ? 0.08 : momentum > 5 ? 0.05 : 0.03;
      if (direction === 'up') return price * (1 + volatilityMult);
      if (direction === 'down') return price * (1 - volatilityMult);
      // Round number target (psychological level)
      if (price > 10000) return Math.ceil(price / 5000) * 5000;
      if (price > 1000) return Math.ceil(price / 500) * 500;
      if (price > 100) return Math.ceil(price / 50) * 50;
      if (price > 10) return Math.ceil(price / 5) * 5;
      if (price > 1) return Math.ceil(price);
      return price * 1.1;
    }

    for (const coin of marketData) {
      if (!coin.current_price) continue;

      const id = coin.id;
      const symbol = (coin.symbol || '').toUpperCase();
      const name = coin.name || symbol;
      const price = coin.current_price;
      const change1h = coin.price_change_percentage_1h_in_currency || 0;
      const change24h = coin.price_change_percentage_24h_in_currency || coin.price_change_percentage_24h || 0;
      const change7d = coin.price_change_percentage_7d_in_currency || 0;
      const ath = coin.ath || 0;
      const athChangePercent = coin.ath_change_percentage || 0;
      const emoji = EMOJI_MAP[id] || '🪙';
      const priceStr = formatPrice(price);
      const athStr = formatPrice(ath);
      const isNearATH = athChangePercent > -10; // Within 10% of ATH
      const isPumping = change24h > 5;
      const isDumping = change24h < -5;
      const isVolatile = Math.abs(change24h) > 8;

      const tier = TIER_1.includes(id) ? 1 : TIER_2.includes(id) ? 2 : TIER_3_IDS.includes(id) ? 3 : 0;
      if (tier === 0) continue; // Skip coins not in our tiers

      const baseMeta = { coinId: id, symbol, priceAtCreation: price, change24h, change7d, ath };

      // === TIER 1 (BTC, ETH): 3 predictions always ===
      if (tier === 1) {
        const roundTarget = getTarget(price, change24h, 'up');
        const roundTargetStr = formatPrice(roundTarget);

        // 1) Price target
        predictions.push({
          question: `${emoji} ${symbol} at ${priceStr} — Will it hit ${roundTargetStr} in the next 8h?`,
          optionA: 'YES', optionB: 'NO',
          category: 'crypto', emoji,
          expiresAt: expiresInHours(8),
          metadata: { ...baseMeta, predType: 'price_target', target: roundTarget }
        });

        // 2) Direction based on momentum
        if (isPumping) {
          predictions.push({
            question: `${emoji} ${symbol} is UP ${change24h.toFixed(1)}% today — Pump continues or pullback incoming?`,
            optionA: 'Keeps pumping', optionB: 'Pullback',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(8),
            metadata: { ...baseMeta, predType: 'momentum' }
          });
        } else if (isDumping) {
          predictions.push({
            question: `${emoji} ${symbol} is DOWN ${Math.abs(change24h).toFixed(1)}% today — Dead cat bounce or more pain?`,
            optionA: 'Bounce', optionB: 'More pain',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(8),
            metadata: { ...baseMeta, predType: 'momentum' }
          });
        } else {
          predictions.push({
            question: `${emoji} ${symbol} at ${priceStr} — Next big move?`,
            optionA: 'Pump incoming', optionB: 'Dump incoming',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(8),
            metadata: { ...baseMeta, predType: 'direction' }
          });
        }

        // 3) ATH / Sentiment / Weekly
        if (isNearATH) {
          predictions.push({
            question: `${emoji} ${symbol} is ${Math.abs(athChangePercent).toFixed(0)}% from ATH (${athStr}) — New ATH this week?`,
            optionA: 'New ATH', optionB: 'Not yet',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(48),
            metadata: { ...baseMeta, predType: 'ath' }
          });
        } else {
          const weekDir = change7d > 0 ? 'up' : 'down';
          predictions.push({
            question: `${emoji} ${symbol} is ${weekDir} ${Math.abs(change7d).toFixed(1)}% this week — Green or red next 24h?`,
            optionA: 'Green', optionB: 'Red',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(24),
            metadata: { ...baseMeta, predType: 'weekly_trend' }
          });
        }
      }

      // === TIER 2: 1-2 predictions ===
      if (tier === 2) {
        // Always: direction question
        if (isPumping) {
          predictions.push({
            question: `${emoji} ${symbol} pumping +${change24h.toFixed(1)}% — FOMO or too late?`,
            optionA: 'Still early', optionB: 'Too late',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(8),
            metadata: { ...baseMeta, predType: 'fomo' }
          });
        } else if (isDumping) {
          predictions.push({
            question: `${emoji} ${symbol} bleeding -${Math.abs(change24h).toFixed(1)}% — Buy the dip or stay away?`,
            optionA: 'Buy the dip', optionB: 'Stay away',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(8),
            metadata: { ...baseMeta, predType: 'dip' }
          });
        } else {
          predictions.push({
            question: `${emoji} ${symbol} at ${priceStr} — Up or down in the next 8h?`,
            optionA: 'Up', optionB: 'Down',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(8),
            metadata: { ...baseMeta, predType: 'direction' }
          });
        }

        // If volatile or near ATH: bonus prediction
        if (isVolatile || isNearATH) {
          const target = getTarget(price, change24h, isPumping ? 'up' : 'down');
          predictions.push({
            question: `${emoji} ${name} at ${priceStr} — Will it hit ${formatPrice(target)} today?`,
            optionA: 'YES', optionB: 'NO',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(12),
            metadata: { ...baseMeta, predType: 'price_target', target }
          });
        }
      }

      // === TIER 3: 1 prediction only if interesting (volatile/pumping/dumping) ===
      if (tier === 3 && (isVolatile || isPumping || isDumping)) {
        if (isPumping) {
          predictions.push({
            question: `${emoji} ${symbol} is ripping +${change24h.toFixed(1)}% — Moon or rug?`,
            optionA: 'To the moon', optionB: 'Rug pull',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(8),
            metadata: { ...baseMeta, predType: 'hype' }
          });
        } else if (isDumping) {
          predictions.push({
            question: `${emoji} ${symbol} crashed -${Math.abs(change24h).toFixed(1)}% — Recovery or RIP?`,
            optionA: 'Recovery', optionB: 'RIP',
            category: 'crypto', emoji,
            expiresAt: expiresInHours(8),
            metadata: { ...baseMeta, predType: 'crash' }
          });
        }
      }
    }

    // === MARKET SENTIMENT: Global question ===
    const btc = marketData.find(c => c.id === 'bitcoin');
    if (btc) {
      const btcChange = btc.price_change_percentage_24h || 0;
      if (Math.abs(btcChange) > 3) {
        predictions.push({
          question: `🌍 Crypto market ${btcChange > 0 ? 'pumping' : 'dumping'} — Alt season incoming or BTC dominance?`,
          optionA: 'Alt season', optionB: 'BTC dominance',
          category: 'crypto', emoji: '🌍',
          expiresAt: expiresInHours(12),
          metadata: { predType: 'market_sentiment', btcChange }
        });
      }
    }

  } catch (e) {
    console.error('Crypto API error:', e.message, e.stack);
  }
  // Return all — BTC/ETH always included, others based on action
  console.log(`  Crypto live engine: ${predictions.length} predictions generated`);
  return predictions;
}

// ============================================
// NEWS-BASED GENERATOR v2 (NewsData.io)
// Uses /latest + /crypto endpoints
// Filters: removeduplicate, prioritydomain, sentiment, timeframe
// ============================================

function smartTruncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
}

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
      url = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&language=${lang}&category=${newsConfig.category}&removeduplicate=1`;
      if (newsConfig.qInTitle) url += `&qInTitle=${newsConfig.qInTitle}`;
      else if (newsConfig.q) url += `&q=${newsConfig.q}`;
      if (newsConfig.prioritydomain) url += `&prioritydomain=${newsConfig.prioritydomain}`;
      // sentiment param not available on free plan
      if (newsConfig.country) url += `&country=${newsConfig.country}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
      if (data.status === 'error') console.error(`  NewsData API error: ${data.results?.message || data.results || 'unknown'}`);
      return predictions;
    }

    // Get format pool for this category
    const formatType = newsConfig.formats || 'general';
    const formatPool = NEWS_FORMATS_BY_TYPE[formatType] || NEWS_FORMATS_BY_TYPE.general;

    // Sort by source authority (lower priority number = more authoritative source)
    const sorted = data.results
      .filter(a => a.title && a.title.length >= 15)
      .sort((a, b) => (a.source_priority || 99999) - (b.source_priority || 99999));

    // Process top 6 articles by authority
    for (const article of sorted.slice(0, 6)) {
      const title = smartTruncate(article.title, 80);
      const fmt = formatPool[Math.floor(Math.random() * formatPool.length)];

      let finalFmt = fmt;

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
          sourceName: article.source_name || null,
          sourcePriority: article.source_priority || null,
          type: isEvent ? 'event' : 'opinion',
          articleId: article.article_id,
          keywords: article.keywords || null,
          sourceUrl: article.link || null
        }
      });
    }
  } catch (e) {
    console.error(`News API error (${newsConfig.predCat}):`, e.message);
  }
  // Return top 5 predictions by source authority (already sorted)
  return predictions.slice(0, 5);
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
  // Count only PRICE-based crypto predictions (not news-based ones)
  const cryptoPricePreds = active.filter(p => p.category === 'crypto' && p.metadata?.coinId).length;
  if (cryptoPricePreds < 8) {
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

  // Only count predictions that have metadata (= generated by new engine, not old static)
  const realSportPreds = active.filter(p =>
    sportCategories.includes(p.category) &&
    p.metadata && (p.metadata.fixtureId || p.metadata.gameId || p.metadata.fightId || p.metadata.raceId || p.metadata.apiType)
  ).length;

  const isWeeklyDay = (dayOfWeek === 1); // Monday only — all sports fetch 7 days ahead
  const isMorning = (hour >= 6 && hour <= 10);
  const isEmergency = realSportPreds < 5; // Emergency only if critically low (was 10, caused quota burn)

  // Rate limit: max 1 weekly sports fetch per 12h to protect API quota
  const lastWeeklyFetch = global._lastWeeklyFetch || 0;
  const hoursSinceLastFetch = (Date.now() - lastWeeklyFetch) / 3600000;
  const canFetch = hoursSinceLastFetch > 12;

  if ((forceWeekly || (isWeeklyDay && isMorning) || isEmergency) && canFetch) {
    if (isEmergency) console.log(`  EMERGENCY: only ${realSportPreds} real sport predictions (${totalSportPreds} total including old static)`);
    global._lastWeeklyFetch = Date.now();
    totalGenerated += await weeklySportsFetch(active);
  } else {
    console.log(`  Sports: ${realSportPreds} real sport predictions active, skipping API (next fetch: Monday morning)`);
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
  console.log('  Sports: Monday morning only, 7-day lookahead (or emergency if < 5 sport preds)');
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
