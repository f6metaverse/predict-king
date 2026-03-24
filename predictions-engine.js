const db = require('./db');

// ============================================
// PREDICT KING — AUTO-GENERATION ENGINE
// International English version
// ============================================

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';

// --- CRYPTO PREDICTIONS ---
async function generateCryptoPredictions() {
  const predictions = [];

  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,ripple,cardano,avalanche-2,polkadot,chainlink,pepe&vs_currencies=usd&include_24hr_change=true';
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

      const priceStr = price > 1 ? Math.round(price).toLocaleString() : price.toFixed(4);
      const targetStr = typeof target === 'number' && target > 1 ? target.toLocaleString() : target;

      const templates = [
        { question: `${coin.name} above $${targetStr} this weekend?`, optionA: 'YES', optionB: 'NO' },
        { question: `${coin.symbol} going up or down in the next 24h?`, optionA: '📈 Up', optionB: '📉 Down' },
        { question: `${coin.name} will outperform ${coins[Math.floor(Math.random() * coins.length)].name} this week?`, optionA: 'YES', optionB: 'NO' },
        { question: `${coin.symbol} hitting a new ATH this month?`, optionA: 'YES', optionB: 'NO' },
        { question: `Is $${priceStr} a good entry for ${coin.symbol}?`, optionA: 'Buy now', optionB: 'Wait' },
      ];

      const tmpl = templates[Math.floor(Math.random() * templates.length)];
      predictions.push({
        ...tmpl,
        category: 'crypto',
        emoji: coin.emoji,
        expiresAt: expires(randomHours(24, 72))
      });
    }
  } catch (e) {
    console.error('Crypto API error:', e.message);
    predictions.push(...getCryptoFallbacks());
  }

  return pickRandom(predictions, 3);
}

function getCryptoFallbacks() {
  return [
    { question: 'Bitcoin hitting $100K before summer?', optionA: 'YES', optionB: 'NO', category: 'crypto', emoji: '₿', expiresAt: expires(72) },
    { question: 'Ethereum flipping Solana in volume this week?', optionA: 'ETH', optionB: 'SOL', category: 'crypto', emoji: '💎', expiresAt: expires(72) },
    { question: 'A memecoin will 10x this week?', optionA: 'YES', optionB: 'NO', category: 'crypto', emoji: '🐸', expiresAt: expires(96) },
    { question: 'Crypto market green or red tomorrow?', optionA: '🟢 Green', optionB: '🔴 Red', category: 'crypto', emoji: '📊', expiresAt: expires(24) },
    { question: 'Best long-term hold right now?', optionA: 'Bitcoin', optionB: 'Ethereum', category: 'crypto', emoji: '💰', expiresAt: expires(96) },
    { question: 'Next memecoin to explode?', optionA: 'DOGE', optionB: 'PEPE', category: 'crypto', emoji: '🚀', expiresAt: expires(72) },
    { question: 'Will a new country adopt Bitcoin as legal tender this year?', optionA: 'YES', optionB: 'NO', category: 'crypto', emoji: '🌍', expiresAt: expires(168) },
    { question: 'DeFi or CeFi winning in 2026?', optionA: 'DeFi', optionB: 'CeFi', category: 'crypto', emoji: '🏦', expiresAt: expires(168) },
  ];
}

// --- CRYPTO NEWS PREDICTIONS ---
async function generateCryptoNewsPredictions() {
  const predictions = [];

  try {
    if (!NEWS_API_KEY) throw new Error('No NEWS API key');

    const url = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&language=en&category=business&q=crypto%20OR%20bitcoin%20OR%20ethereum`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      for (const article of data.results.slice(0, 3)) {
        if (article.title && article.title.length > 15) {
          const title = article.title.slice(0, 75);
          predictions.push({
            question: `"${title}" — Bullish or bearish for crypto?`,
            optionA: '🟢 Bullish',
            optionB: '🔴 Bearish',
            category: 'crypto',
            emoji: '📰',
            expiresAt: expires(48)
          });
        }
      }
    }
  } catch (e) {
    console.error('Crypto News API error:', e.message);
  }

  return pickRandom(predictions, 1);
}

// --- FOOTBALL PREDICTIONS ---
async function generateFootballPredictions() {
  const predictions = [];

  try {
    if (!FOOTBALL_API_KEY) throw new Error('No API key');

    const today = new Date().toISOString().split('T')[0];
    // Also check tomorrow for upcoming matches
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Fetch today's matches across all leagues
    const url = `https://v3.football.api-sports.io/fixtures?date=${today}&season=2025`;
    const url2 = `https://v3.football.api-sports.io/fixtures?date=${tomorrow}&season=2025`;
    const headers = { 'x-apisports-key': FOOTBALL_API_KEY };

    const [res1, res2] = await Promise.all([
      fetch(url, { headers }),
      fetch(url2, { headers })
    ]);
    const [data1, data2] = await Promise.all([res1.json(), res2.json()]);

    const allMatches = [...(data1.response || []), ...(data2.response || [])];
    // Filter for top leagues: PL, La Liga, Ligue 1, Serie A, UCL, Bundesliga, MLS, Liga MX
    const topLeagues = [39, 140, 61, 135, 2, 78, 253, 262];
    const topMatches = allMatches.filter(m => topLeagues.includes(m.league?.id));
    const matches = topMatches.length > 0 ? topMatches : allMatches;

    if (matches.length > 0) {
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
          category: 'football',
          emoji: '⚽',
          expiresAt: expires(24)
        });
      }
    }
  } catch (e) {
    console.error('Football API error:', e.message);
  }

  if (predictions.length === 0) predictions.push(...getFootballFallbacks());
  return pickRandom(predictions, 3);
}

function getFootballFallbacks() {
  const pools = [
    { question: 'Real Madrid winning the Champions League this season?', optionA: 'YES', optionB: 'NO' },
    { question: 'Mbappe scoring this weekend?', optionA: 'YES', optionB: 'NO' },
    { question: 'Who goes further in the UCL?', optionA: 'Real Madrid', optionB: 'Man City' },
    { question: 'Premier League: Arsenal finally winning the title?', optionA: 'YES', optionB: 'NO' },
    { question: 'Transfer over $150M happening this summer?', optionA: 'YES', optionB: 'NO' },
    { question: 'Vinicius Jr winning the Ballon d\'Or 2026?', optionA: 'YES', optionB: 'NO' },
    { question: 'Best league in the world?', optionA: 'Premier League', optionB: 'La Liga' },
    { question: 'Haaland hitting 40+ goals this season?', optionA: 'YES', optionB: 'NO' },
    { question: 'A relegation team beating a top 4 team this weekend?', optionA: 'YES', optionB: 'NO' },
    { question: 'Liverpool winning a trophy this season?', optionA: 'YES', optionB: 'NO' },
    { question: 'Next El Clasico: More than 4 goals?', optionA: 'YES', optionB: 'NO' },
    { question: 'Bayern Munich bouncing back to dominate Bundesliga?', optionA: 'YES', optionB: 'NO' },
  ];
  return pools.map(p => ({ ...p, category: 'football', emoji: '⚽', expiresAt: expires(48) }));
}

// --- NBA PREDICTIONS (LIVE API) ---
async function generateNBAPredictions() {
  const predictions = [];

  try {
    if (!FOOTBALL_API_KEY) throw new Error('No API key');

    const today = new Date().toISOString().split('T')[0];
    const url = `https://v1.basketball.api-sports.io/games?date=${today}`;
    const res = await fetch(url, { headers: { 'x-apisports-key': FOOTBALL_API_KEY } });
    const data = await res.json();

    if (data.response && data.response.length > 0) {
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
          category: 'nba', emoji: '🏀', expiresAt: expires(24)
        });
      }
    }
  } catch (e) {
    console.error('NBA API error:', e.message);
  }

  if (predictions.length === 0) {
    const pools = [
      { question: 'Wembanyama winning MVP this season?', optionA: 'YES', optionB: 'NO' },
      { question: 'LeBron James retiring in 2026?', optionA: 'YES', optionB: 'NO' },
      { question: 'Who wins the NBA Championship?', optionA: 'Celtics', optionB: 'Nuggets' },
      { question: 'Steph Curry breaking his own 3-point record?', optionA: 'YES', optionB: 'NO' },
      { question: 'Better stats this month: Wemby or Luka?', optionA: 'Wemby', optionB: 'Luka' },
      { question: 'A player dropping 60+ points this week?', optionA: 'YES', optionB: 'NO' },
      { question: 'Lakers making the playoffs?', optionA: 'YES', optionB: 'NO' },
      { question: 'Most exciting young star in the NBA?', optionA: 'Wembanyama', optionB: 'Ant Edwards' },
    ];
    predictions.push(...pools.map(p => ({ ...p, category: 'nba', emoji: '🏀', expiresAt: expires(48) })));
  }

  return pickRandom(predictions, 2);
}

// --- UFC / COMBAT (LIVE API) ---
async function generateCombatPredictions() {
  const predictions = [];

  try {
    if (!FOOTBALL_API_KEY) throw new Error('No API key');

    // Get upcoming MMA events
    const url = `https://v1.mma.api-sports.io/fights?next=5`;
    const res = await fetch(url, { headers: { 'x-apisports-key': FOOTBALL_API_KEY } });
    const data = await res.json();

    if (data.response && data.response.length > 0) {
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
            category: 'combat', emoji: '🥊', expiresAt: expires(72)
          });
        }
      }
    }
  } catch (e) {
    console.error('MMA API error:', e.message);
  }

  if (predictions.length === 0) {
    const pools = [
      { question: 'UFC main event this weekend ending by KO?', optionA: 'KO/TKO', optionB: 'Decision' },
      { question: 'Conor McGregor actually coming back to fight?', optionA: 'YES', optionB: 'NO' },
      { question: 'Jake Paul losing his next fight?', optionA: 'He loses', optionB: 'He wins' },
      { question: 'Jon Jones the GOAT of MMA?', optionA: 'GOAT', optionB: 'Overrated' },
      { question: 'Islam Makhachev staying unbeaten this year?', optionA: 'YES', optionB: 'NO' },
    ];
    predictions.push(...pools.map(p => ({ ...p, category: 'combat', emoji: '🥊', expiresAt: expires(72) })));
  }

  return pickRandom(predictions, 1);
}

// --- F1 (LIVE API) ---
async function generateF1Predictions() {
  const predictions = [];

  try {
    if (!FOOTBALL_API_KEY) throw new Error('No API key');

    const url = `https://v1.formula-1.api-sports.io/races?next=3`;
    const res = await fetch(url, { headers: { 'x-apisports-key': FOOTBALL_API_KEY } });
    const data = await res.json();

    if (data.response && data.response.length > 0) {
      for (const race of data.response.slice(0, 2)) {
        const name = race.competition?.name || 'next race';
        predictions.push({
          question: `F1 ${name}: Who takes pole position?`,
          optionA: 'Verstappen', optionB: 'Someone else',
          category: 'f1', emoji: '🏎️', expiresAt: expires(72)
        });
        predictions.push({
          question: `Safety Car at the ${name}?`,
          optionA: 'YES', optionB: 'NO',
          category: 'f1', emoji: '🏎️', expiresAt: expires(72)
        });
      }
    }
  } catch (e) {
    console.error('F1 API error:', e.message);
  }

  if (predictions.length === 0) {
    const pools = [
      { question: 'Verstappen winning the next Grand Prix?', optionA: 'YES', optionB: 'NO' },
      { question: 'Hamilton regretting Ferrari before end of season?', optionA: 'YES', optionB: 'NO' },
      { question: 'Leclerc winning at Monaco?', optionA: 'YES', optionB: 'NO' },
      { question: 'Who finishes higher in the championship?', optionA: 'Red Bull', optionB: 'Ferrari' },
      { question: 'McLaren becoming a serious title contender?', optionA: 'YES', optionB: 'NO' },
    ];
    predictions.push(...pools.map(p => ({ ...p, category: 'f1', emoji: '🏎️', expiresAt: expires(72) })));
  }
  return pickRandom(predictions, 1);
}

// --- NFL PREDICTIONS (LIVE API) ---
async function generateNFLPredictions() {
  const predictions = [];

  try {
    if (!FOOTBALL_API_KEY) throw new Error('No API key');

    const today = new Date().toISOString().split('T')[0];
    const url = `https://v1.american-football.api-sports.io/games?date=${today}`;
    const res = await fetch(url, { headers: { 'x-apisports-key': FOOTBALL_API_KEY } });
    const data = await res.json();

    if (data.response && data.response.length > 0) {
      const nflGames = data.response.filter(g => g.league?.name?.includes('NFL'));
      for (const game of nflGames.slice(0, 3)) {
        const home = game.teams.home.name;
        const away = game.teams.away.name;
        predictions.push({
          question: `NFL: ${home} vs ${away} — Who wins?`,
          optionA: home, optionB: away,
          category: 'nfl', emoji: '🏈', expiresAt: expires(24)
        });
      }
    }
  } catch (e) {
    console.error('NFL API error:', e.message);
  }

  if (predictions.length === 0) {
    const pools = [
      { question: 'Patrick Mahomes winning another Super Bowl?', optionA: 'YES', optionB: 'NO' },
      { question: 'Best QB in the NFL right now?', optionA: 'Mahomes', optionB: 'Josh Allen' },
      { question: 'A rookie QB leading his team to playoffs?', optionA: 'YES', optionB: 'NO' },
      { question: 'Cowboys making a deep playoff run this year?', optionA: 'YES', optionB: 'NO' },
      { question: 'NFL or NBA: bigger global audience by 2027?', optionA: 'NFL', optionB: 'NBA' },
    ];
    predictions.push(...pools.map(p => ({ ...p, category: 'nfl', emoji: '🏈', expiresAt: expires(72) })));
  }

  return pickRandom(predictions, 1);
}

// --- HOCKEY / NHL PREDICTIONS (LIVE API) ---
async function generateHockeyPredictions() {
  const predictions = [];

  try {
    if (!FOOTBALL_API_KEY) throw new Error('No API key');

    const today = new Date().toISOString().split('T')[0];
    const url = `https://v1.hockey.api-sports.io/games?date=${today}`;
    const res = await fetch(url, { headers: { 'x-apisports-key': FOOTBALL_API_KEY } });
    const data = await res.json();

    if (data.response && data.response.length > 0) {
      const nhlGames = data.response.filter(g => g.league?.name?.includes('NHL'));
      for (const game of nhlGames.slice(0, 3)) {
        const home = game.teams.home.name;
        const away = game.teams.away.name;
        predictions.push({
          question: `NHL: ${home} vs ${away} — Who wins?`,
          optionA: home, optionB: away,
          category: 'hockey', emoji: '🏒', expiresAt: expires(24)
        });
      }
    }
  } catch (e) {
    console.error('Hockey API error:', e.message);
  }

  if (predictions.length === 0) {
    const pools = [
      { question: 'Connor McDavid winning the Hart Trophy again?', optionA: 'YES', optionB: 'NO' },
      { question: 'A Canadian team winning the Stanley Cup?', optionA: 'YES', optionB: 'NO' },
      { question: 'Over 7 goals in tonight\'s biggest NHL game?', optionA: 'YES', optionB: 'NO' },
    ];
    predictions.push(...pools.map(p => ({ ...p, category: 'hockey', emoji: '🏒', expiresAt: expires(72) })));
  }

  return pickRandom(predictions, 1);
}

// --- RUGBY PREDICTIONS (LIVE API) ---
async function generateRugbyPredictions() {
  const predictions = [];

  try {
    if (!FOOTBALL_API_KEY) throw new Error('No API key');

    const today = new Date().toISOString().split('T')[0];
    const url = `https://v1.rugby.api-sports.io/games?date=${today}`;
    const res = await fetch(url, { headers: { 'x-apisports-key': FOOTBALL_API_KEY } });
    const data = await res.json();

    if (data.response && data.response.length > 0) {
      for (const game of data.response.slice(0, 3)) {
        const home = game.teams.home.name;
        const away = game.teams.away.name;
        predictions.push({
          question: `Rugby: ${home} vs ${away} — Who wins?`,
          optionA: home, optionB: away,
          category: 'rugby', emoji: '🏉', expiresAt: expires(24)
        });
      }
    }
  } catch (e) {
    console.error('Rugby API error:', e.message);
  }

  if (predictions.length === 0) {
    const pools = [
      { question: 'New Zealand winning the next Rugby World Cup?', optionA: 'YES', optionB: 'NO' },
      { question: 'Best rugby nation in the world?', optionA: 'New Zealand', optionB: 'South Africa' },
      { question: 'A record score in the Six Nations this year?', optionA: 'YES', optionB: 'NO' },
    ];
    predictions.push(...pools.map(p => ({ ...p, category: 'rugby', emoji: '🏉', expiresAt: expires(72) })));
  }

  return pickRandom(predictions, 1);
}

// --- MUSIC ---
function generateMusiquePredictions() {
  const pools = [
    { question: 'Who gets more streams this week?', optionA: 'Drake', optionB: 'Kendrick Lamar' },
    { question: 'Travis Scott dropping a new album this year?', optionA: 'YES', optionB: 'NO' },
    { question: 'Biggest artist in the world right now?', optionA: 'Taylor Swift', optionB: 'The Weeknd' },
    { question: 'A song hitting 1 billion Spotify streams this month?', optionA: 'YES', optionB: 'NO' },
    { question: 'Best rapper alive?', optionA: 'Kendrick', optionB: 'J. Cole' },
    { question: 'Next #1 on Billboard: rap or pop?', optionA: 'Rap', optionB: 'Pop' },
    { question: 'BTS member solo album outselling group album?', optionA: 'YES', optionB: 'NO' },
    { question: 'Beyonce dropping a new album before summer?', optionA: 'YES', optionB: 'NO' },
    { question: 'Central Cee becoming the biggest UK rapper ever?', optionA: 'YES', optionB: 'NO' },
    { question: 'Bad Bunny or Drake: more monthly Spotify listeners?', optionA: 'Bad Bunny', optionB: 'Drake' },
    { question: 'Biggest tour of 2026?', optionA: 'Taylor Swift', optionB: 'The Weeknd' },
    { question: 'A K-pop group outselling every Western artist this year?', optionA: 'YES', optionB: 'NO' },
    { question: 'SZA or Doja Cat: who runs R&B?', optionA: 'SZA', optionB: 'Doja Cat' },
    { question: 'Will AI-generated music hit #1 on charts in 2026?', optionA: 'YES', optionB: 'NO' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'musique', emoji: '🎵', expiresAt: expires(96) })), 2);
}

// --- GAMING ---
function generateGamingPredictions() {
  const pools = [
    { question: 'GTA 6 releasing on time?', optionA: 'On time', optionB: 'Delayed' },
    { question: 'Best-selling game of 2026?', optionA: 'GTA 6', optionB: 'Something else' },
    { question: 'PS5 Pro outselling Xbox?', optionA: 'PS5 Pro', optionB: 'Xbox' },
    { question: 'Fortnite dropping an event bigger than Travis Scott concert?', optionA: 'YES', optionB: 'NO' },
    { question: 'Nintendo announcing a new console?', optionA: 'YES', optionB: 'NO' },
    { question: 'Next Call of Duty being the best in the franchise?', optionA: 'YES', optionB: 'NO' },
    { question: 'EA FC 26 better than 25?', optionA: 'Better', optionB: 'Worse' },
    { question: 'A free-to-play game breaking a player count record this month?', optionA: 'YES', optionB: 'NO' },
    { question: 'PC or Console: better for gaming in 2026?', optionA: 'PC', optionB: 'Console' },
    { question: 'Minecraft still the most played game in the world?', optionA: 'YES', optionB: 'NO' },
    { question: 'VR gaming going mainstream this year?', optionA: 'YES', optionB: 'NO' },
    { question: 'Elden Ring DLC: Game of the Year material?', optionA: 'GOTY', optionB: 'Overrated' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'gaming', emoji: '🎮', expiresAt: expires(96) })), 1);
}

// --- CINEMA & SERIES ---
function generateCinemaPredictions() {
  const pools = [
    { question: 'Next Marvel movie crossing $1 billion box office?', optionA: 'YES', optionB: 'NO' },
    { question: 'Marvel or DC: better movie in 2026?', optionA: 'Marvel', optionB: 'DC' },
    { question: 'Squid Game S3 beating S1 viewership records?', optionA: 'YES', optionB: 'NO' },
    { question: 'Netflix or Disney+: more hits this year?', optionA: 'Netflix', optionB: 'Disney+' },
    { question: 'An anime becoming the #1 movie worldwide this month?', optionA: 'YES', optionB: 'NO' },
    { question: 'Best streaming platform in 2026?', optionA: 'Netflix', optionB: 'YouTube' },
    { question: 'A horror movie grossing $500M+ this year?', optionA: 'YES', optionB: 'NO' },
    { question: 'Avatar 3 beating Avatar 2 box office?', optionA: 'YES', optionB: 'NO' },
    { question: 'Stranger Things finale: satisfying or disappointing?', optionA: 'Fire', optionB: 'Trash' },
    { question: 'Biggest movie flop of 2026 will be from which studio?', optionA: 'Disney', optionB: 'Warner Bros' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'cinema', emoji: '🎬', expiresAt: expires(96) })), 1);
}

// --- DRAMA & BUZZ ---
function generateDramaPredictions() {
  const pools = [
    { question: 'Elon Musk causing another controversy this week?', optionA: 'YES (obviously)', optionB: 'NO (miracle)' },
    { question: 'IShowSpeed hitting 50M YouTube subscribers?', optionA: 'YES', optionB: 'NO' },
    { question: 'MrBeast dropping a 200M+ views video this month?', optionA: 'YES', optionB: 'NO' },
    { question: 'A major YouTuber getting cancelled this week?', optionA: 'YES', optionB: 'NO' },
    { question: 'AI replacing a major job category by end of 2026?', optionA: 'YES', optionB: 'NO' },
    { question: 'Apple announcing a revolutionary product in 2026?', optionA: 'YES', optionB: 'NO' },
    { question: 'Next global viral moment: positive or negative?', optionA: 'Positive', optionB: 'Negative' },
    { question: 'A billionaire going to space again this year?', optionA: 'YES', optionB: 'NO' },
    { question: 'Twitter/X still relevant in 2026?', optionA: 'YES', optionB: 'NO' },
    { question: 'An influencer running for political office this year?', optionA: 'YES', optionB: 'NO' },
    { question: 'TikTok getting banned in another country?', optionA: 'YES', optionB: 'NO' },
    { question: 'Biggest tech layoff of 2026 coming from?', optionA: 'Google', optionB: 'Meta' },
    { question: 'Sam Altman making a shocking announcement this month?', optionA: 'YES', optionB: 'NO' },
  ];
  return pickRandom(pools.map(p => ({ ...p, category: 'drama', emoji: '👀', expiresAt: expires(72) })), 1);
}

// --- NEWS-BASED PREDICTIONS ---
async function generateNewsPredictions() {
  const predictions = [];

  try {
    if (!NEWS_API_KEY) throw new Error('No NEWS API key');

    const url = `https://newsdata.io/api/1/latest?apikey=${NEWS_API_KEY}&language=en&category=top`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      for (const article of data.results.slice(0, 3)) {
        if (article.title && article.title.length > 10) {
          predictions.push({
            question: `"${article.title.slice(0, 80)}..." — Will this change anything?`,
            optionA: 'Big impact',
            optionB: 'Forgotten tomorrow',
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

  if (predictions.length === 0) predictions.push(...getTrendingFallbacks());
  return pickRandom(predictions, 1);
}

function getTrendingFallbacks() {
  return [
    { question: 'Hottest topic this week: politics or entertainment?', optionA: 'Politics', optionB: 'Entertainment', category: 'trending', emoji: '🔥', expiresAt: expires(48) },
    { question: 'A news story breaking the internet this week?', optionA: 'YES', optionB: 'NO', category: 'trending', emoji: '🔥', expiresAt: expires(72) },
    { question: 'Most talked about person this week?', optionA: 'Elon Musk', optionB: 'Someone else', category: 'trending', emoji: '🔥', expiresAt: expires(72) },
  ];
}

// ============================================
// MAIN GENERATOR
// ============================================
async function generateDailyPredictions() {
  console.log('\n🔮 Generating daily predictions...');

  const results = await Promise.allSettled([
    generateCryptoPredictions(),
    generateCryptoNewsPredictions(),
    generateFootballPredictions(),
    generateNBAPredictions(),
    generateCombatPredictions(),
    generateF1Predictions(),
    generateNFLPredictions(),
    generateHockeyPredictions(),
    generateRugbyPredictions(),
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

function startScheduler() {
  console.log('⏰ Prediction scheduler started');

  const active = db.getActivePredictions();
  if (active.length < 5) {
    generateDailyPredictions();
  }

  setInterval(async () => {
    cleanupExpired();
    const active = db.getActivePredictions();
    if (active.length < 8) {
      await generateDailyPredictions();
    }
  }, 8 * 60 * 60 * 1000);

  setInterval(() => {
    cleanupExpired();
  }, 60 * 60 * 1000);
}

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
