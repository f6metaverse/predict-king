# PREDICT KING — Reference complete (28 Mars 2026 — v2.1)

## L'APP

| | Detail |
|---|--------|
| **Type** | Telegram Mini App |
| **Bot** | @PredictKingAppBot |
| **URL** | predict-king-production.up.railway.app |
| **Hosting** | Railway (auto-deploy depuis GitHub) |
| **Database** | Supabase PostgreSQL (EU West) |
| **Repo** | github.com/f6metaverse/predict-king |
| **Cost total** | **$0/mois** |

---

## LES 3 APIs

### 1. API-SPORTS — Les matchs reels

| | Detail |
|---|--------|
| **Domaines** | `v3.football.api-sports.io`, `v1.basketball.api-sports.io`, `v1.hockey.api-sports.io`, `v1.american-football.api-sports.io`, `v1.rugby.api-sports.io`, `v1.mma.api-sports.io` |
| **Plan** | Free |
| **Quota** | **100 requetes/jour** |
| **Cost** | **$0** |
| **Cle** | `FOOTBALL_API_KEY` (meme cle pour tous les sports) |
| **Header** | `x-apisports-key` |
| **NOTE** | Ancien compte banni le 28/03/2026 (auto-resolve spammait l'API). Nouveau compte cree. |

### 2. COINGECKO — Prix crypto en temps reel

| | Detail |
|---|--------|
| **Domaine** | `api.coingecko.com` |
| **Endpoint** | `/api/v3/coins/markets` |
| **Plan** | Free / Demo |
| **Quota** | **30 appels/min** |
| **Cost** | **$0** |
| **Cle** | `COINGECKO_API_KEY` (optionnelle) |

### 3. NEWSDATA.IO — Actualites mondiales

| | Detail |
|---|--------|
| **Domaine** | `newsdata.io` |
| **Endpoints** | `/api/1/latest` + `/api/1/crypto` |
| **Plan** | Free |
| **Quota** | **200 appels/jour** |
| **Cost** | **$0** |
| **Cle** | `NEWS_API_KEY` |

---

## ARCHITECTURE DES FETCHS

```
LUNDI MATIN (1x/semaine) — API-Sports [~41 appels]
├── ⚽ Football     7 jours (getNextDays(6)) → top 8 matchs
├── 🏀 NBA          7 jours → top 8 games (big market priority)
├── 🏒 Hockey       7 jours → 6 NHL + 2 KHL
├── 🏈 NFL          7 jours → top 8 games
├── 🏉 Rugby        7 jours → top 6 games (top leagues priority)
└── 🥊 MMA/UFC      6 jours → top 8 fights (main event priority)

TOUTES LES 3H — NewsData + CoinGecko [gratuit]
├── 🏎 F1           → parse news, extract pilotes/teams
├── 🏍 MotoGP       → parse news, extract riders/teams
├── 🎾 Tennis       → parse news, extract joueurs ATP+WTA
├── 🥊 Boxing       → parse news, detect matchups + classify
├── 🤼 WWE          → parse news, detect storylines + matchups
├── ⚽ Foot stories → parse news (transferts, Ballon d'Or, UCL...)
├── 🏀 NBA stories  → parse news (MVP, trades, playoffs...)
├── ₿ Crypto prix   → CoinGecko real-time prices
└── 📰 News rotation → 15 cycles x 4 categories
```

---

## TOUS LES SPORTS — Detail complet

### SPORTS API-SPORTS (matchs reels, auto-resolve par score)

#### ⚽ Football — `generateFootballLive()`
- **API** : `v3.football.api-sports.io/fixtures?date={YYYY-MM-DD}`
- **Lookahead** : 7 jours
- **Leagues** : 3 tiers (36 ligues)
  - TIER 1 (2 preds/match) : Champions League, Europa League, World Cup, Euro, Premier League, La Liga, Serie A, Bundesliga, Ligue 1
  - TIER 2 (1 pred/match) : Copa Libertadores, Nations League, Copa America, AFCON, Eredivisie, Liga MX, Serie A Brazil, Primeira Liga, Belgian, Super Lig, Saudi Pro, MLS
  - TIER 3 (1 pred/match) : Conference League, Super Cup, qualifs, regionals
- **Templates** : winner, over 2.5 goals, clean sheet
- **Metadata** : `{ fixtureId, kickoff, apiType: 'football', homeTeam, awayTeam, leagueId, leagueName }`
- **Auto-resolve** : OUI (score reel via API)
- **Sous-filtres frontend** : OUI (par ligue avec drapeaux)
- **MIN_SLOTS** : 8

#### 🏀 NBA — `generateNBALive()`
- **API** : `v1.basketball.api-sports.io/games?date={date}`
- **Lookahead** : 7 jours
- **Priorite** : Big market teams (Lakers, Warriors, Celtics, Knicks, etc.)
- **Templates** : winner, over 220 combined points
- **Auto-resolve** : OUI
- **MIN_SLOTS** : 6

#### 🏒 Hockey — `generateHockeyLive()`
- **API** : `v1.hockey.api-sports.io/games?date={date}`
- **Lookahead** : 7 jours
- **Split** : 6 NHL + 2 KHL
- **Templates** : winner, over 5.5 goals
- **Auto-resolve** : OUI
- **MIN_SLOTS** : 6

#### 🏈 NFL — `generateNFLLive()`
- **API** : `v1.american-football.api-sports.io/games?date={date}`
- **Lookahead** : 7 jours
- **Templates** : winner, over 45 total points
- **Auto-resolve** : OUI
- **MIN_SLOTS** : 4

#### 🏉 Rugby — `generateRugbyLive()`
- **API** : `v1.rugby.api-sports.io/games?date={date}`
- **Lookahead** : 7 jours
- **Top leagues** : Top 14 (16), Premiership (48), URC (76), Super Rugby (71), MLR (44), Top League Japan (27), Premiership (13)
- **Templates** : winner, winning margin > 10 points
- **Metadata** : `{ gameId, kickoff, apiType: 'rugby', leagueId, leagueName }`
- **Auto-resolve** : Score reel + fallback majority
- **Sous-filtres frontend** : OUI (par ligue avec drapeaux)
- **MIN_SLOTS** : 3

#### 🥊 MMA/Combat — `generateCombatLive()`
- **API** : `v1.mma.api-sports.io/fights?date={date}`
- **Lookahead** : 6 jours
- **Priorite** : Main event > main card > prelims
- **Main event** : 3 preds (winner, KO/Decision, Over/Under 2.5 rounds)
- **Autres** : 1 pred (winner ou method)
- **Auto-resolve** : Partiel (fallback majority)
- **MIN_SLOTS** : 5

---

### SPORTS NEWS-POWERED (NewsData, toutes les 3h, gratuit)

#### 🏎 F1 — `generateF1Live()`
- **Source** : NewsData (`qInTitle: F1 OR Formula 1 OR Grand Prix OR {GP}`)
- **Calendrier** : 22 courses hardcodees (2026, source: f1calendar.com)
- **Pilotes** : 20 (Verstappen, Hamilton, Leclerc, Norris, Russell, Antonelli, Alonso, Gasly, Sainz, Tsunoda, etc.)
- **Teams** : 10 (Red Bull, Ferrari, McLaren, Mercedes, Aston Martin, Alpine, Williams, RB, Sauber, Haas)
- **GP Aliases** : detection du GP dans les articles (ex: "suzuka" → Japanese GP)
- **Predictions** :
  1. Head-to-head (top 2 pilotes mentionnes)
  2. Podium (3e pilote)
  3. Team battle (top 2 teams)
  4. Pole position
  5. Teammate battle (meme ecurie)
  6. Race drama (safety car / DNF / first lap)
- **Expiry** : jour de la course (calendrier)
- **MIN_SLOTS** : 4

#### 🏍 MotoGP — `generateMotoGPLive()`
- **Source** : NewsData (`qInTitle: MotoGP OR Moto GP OR {GP}`)
- **Calendrier** : 22 courses (2026, source: motogpcal.com)
- **Riders** : 22 (Marquez, Bagnaia, Martin, Acosta, Quartararo, Binder, Razgatlioglu, etc.)
- **Teams** : 11 (Ducati Lenovo, Aprilia, KTM, Yamaha, Honda, Gresini, VR46, Pramac, Tech3, Trackhouse, LCR)
- **Predictions** : meme structure que F1 (head-to-head, podium, team, pole, teammate, drama)
- **MIN_SLOTS** : 4

#### 🎾 Tennis — `generateTennisLive()`
- **Source** : NewsData (`qInTitle: tennis OR {tournament} OR ATP OR WTA`)
- **Calendrier** : 13 tournois (4 Grand Slams + 9 Masters 1000)
  - Slams : Australian Open (Jan), Roland-Garros (Mai-Jun), Wimbledon (Jun-Jul), US Open (Aug-Sep)
  - Masters : Indian Wells, Miami, Monte-Carlo, Madrid, Rome, Montreal, Cincinnati, Shanghai, Paris
- **Joueurs ATP** : 15 (Alcaraz, Sinner, Djokovic, Zverev, Musetti, De Minaur, Fritz, Shelton, Medvedev, Ruud, Rublev, Tiafoe, etc.)
- **Joueuses WTA** : 10 (Sabalenka, Rybakina, Swiatek, Gauff, Pegula, Paolini, Andreeva, Osaka, Muchova, Keys)
- **Smart detection** : detecte si on est PENDANT un tournoi ou si un tournoi arrive dans 14 jours
- **Predictions** :
  1. ATP head-to-head
  2. WTA head-to-head
  3. ATP title winner
  4. WTA title winner
  5. Dark horse / deep run
  6. **Bonus Grand Slam** : upset alert + 5-set epic
  7. Match drama (rain, qualifier, retirement)
- **Expiry** : fin du tournoi
- **MIN_SLOTS** : 5

#### 🥊 Boxing — `generateBoxingLive()`
- **Source** : NewsData (`qInTitle: boxing OR boxer OR title fight OR heavyweight OR WBC OR WBA OR IBF OR WBO`)
- **PAS de calendrier** — 100% pilote par les news
- **Fighters** : 25 (Usyk, Inoue, Stevenson, Bivol, Fury, Joshua, Wilder, Canelo, Benavidez, Tank Davis, Haney, Fundora, Katie Taylor, Serrano, Mayweather, Pacquiao, etc.)
- **Detection de matchups** : regex `A vs B` dans les titres d'articles
- **Classification intelligente** :
  - 🟢 **CONFIRMED** (signed, scheduled, PPV) → 3 preds : winner + method + rounds
  - 🟡 **ANNOUNCED** (deal, will fight) → 2 preds : winner + method
  - 🟠 **RUMORED** (in talks, reportedly) → 2 preds : "Will it happen?" + "Who wins if so?"
  - 🔵 **BUZZ** (could, should, dream fight) → 1 pred : "Should this fight happen?"
- **Keywords de classification** : 4 dictionnaires (CONFIRMED_KW, ANNOUNCED_KW, RUMORED_KW, BUZZ_KW)
- **MIN_SLOTS** : 4

#### 🤼 WWE — `generateWWELive()`
- **Source** : NewsData (`qInTitle: WWE OR WrestleMania OR SmackDown OR Raw wrestling`)
- **Calendrier PLE** : 9 events (NXT Roadblock, Stand & Deliver, WrestleMania 42, Backlash, SummerSlam, Money in the Bank, etc.)
- **Superstars** : 30 (CM Punk, Cody Rhodes, Roman Reigns, Seth Rollins, Drew McIntyre, Gunther, Rhea Ripley, Becky Lynch, Bianca Belair, John Cena, The Rock, etc.)
- **Detection PLE** : detecte si un Premium Live Event arrive dans 21 jours
- **Detection storylines** :
  - Heel turns (betrayal, attacked)
  - Surprise returns (comeback, shock return)
  - Title changes (new champion, cashes in)
  - Brand drafts (trade, switches brands)
- **Predictions** :
  - **PLE coming** : match winners, title change, surprise return, MOTN
  - **WrestleMania/SummerSlam** : bonus (surprise debut, main event vs undercard)
  - **Storyline** : heel turn, return type, title defense
  - **Weekly** : Raw/SmackDown — who stands tall
  - **Debate** : best ITW, show rating, champion by year end
- **MIN_SLOTS** : 4

---

### STORYLINES NEWS-POWERED (completent les matchs API-Sports)

#### ⚽ Football Storylines — `generateFootballStorylines()`
- **Source** : NewsData (`qInTitle: Premier League OR Champions League OR La Liga OR transfer OR Ballon d'Or OR World Cup OR Mbappe OR Haaland`)
- **Joueurs** : 20 (Mbappe, Yamal, Haaland, Kane, Vinicius, Dembele, Olise, Bellingham, Salah, Palmer, Saka, Messi, Ronaldo, De Bruyne, Pedri, Rice, Rodri, Lewandowski, Osimhen, Wirtz)
- **Clubs** : 18 (Real Madrid, Barcelona, Man City, Liverpool, Arsenal, Chelsea, Bayern, PSG, Inter, Juventus, Dortmund, Atletico, Napoli, Leverkusen, Man United, Tottenham, Newcastle, AC Milan)
- **Detection storylines** :
  - TRANSFER_KW : transfer, signing, deal, leaving, release clause, free agent...
  - TITLE_RACE_KW : title race, championship, league title, clinch...
  - AWARD_KW : ballon d'or, golden boot, player of the year...
  - MANAGER_KW : sacked, fired, appointed, new manager, resigns...
  - UCL_KW : champions league, ucl, semifinal, quarterfinal, draw...
  - WORLD_CUP_KW : world cup, qualification, national team...
- **Predictions** : transfert, course au titre, Ballon d'Or, UCL, manager sacking, World Cup, best player debate
- **Categorie** : `football` (s'affiche avec les matchs)
- **Comptage separe** : metadata `apiType: 'football-storyline'` pour eviter conflit avec matchs

#### 🏀 NBA Storylines — `generateNBAStorylines()`
- **Source** : NewsData (`qInTitle: NBA OR basketball OR Lakers OR Celtics OR MVP`)
- **Joueurs** : 15 (Wembanyama, SGA, Jokic, Luka, Jaylen Brown, Tatum, Giannis, Curry, LeBron, Durant, Edwards, Brunson, Cade, Embiid, Morant)
- **Teams** : 16 (Lakers, Celtics, Warriors, Thunder, Spurs, Nuggets, Bucks, Knicks, Suns, 76ers, Heat, Timberwolves, Grizzlies, Mavericks, Cavaliers, Pistons)
- **Detection** : MVP_KW, TRADE_KW, PLAYOFF_KW, RECORD_KW
- **Predictions** : MVP race, trade bomb, playoff series, championship, player debate
- **Categorie** : `nba` (s'affiche avec les matchs)

---

### CRYPTO — `generateCryptoLive()`

- **Source** : CoinGecko `/api/v3/coins/markets` (top 30 par market cap)
- **Tiers** :
  - TIER 1 (BTC, ETH) : 3 preds chacun (price target, momentum, ATH/weekly)
  - TIER 2 (SOL, XRP, DOGE, ADA, TRON) : 1-2 preds si mouvement
  - TIER 3 (AVAX, LINK, DOT, PEPE, SHIB, SUI, NEAR, LTC) : 1 pred si volatile
- **Types** : price_target, momentum, direction, ath, fomo, dip, hype, crash, market_sentiment
- **Expiry** : 8h (prix), 12h (sentiment), 24h (weekly), 48h (ATH)
- **Auto-resolve** : OUI (re-fetch prix reel)
- **MIN_SLOTS** : 8

---

### NEWS — `generateFromNews(newsConfig)`

- **15 cycles de rotation** x 4 categories chacun
- **Chaque cycle** : fetch articles → sort by source_priority → top 6 articles → pick random format template → generate predictions
- **Smart expiry** : detecte 50+ event keywords → adapte la duree (12h news, 72h event, 7j next week)
- **155+ templates de questions** (triple depuis le 28/03/2026) — 12-15 templates uniques par categorie
- **Categories actives** : musique, gaming, cinema, drama, politics, world, science, health, trending, crime, environment, business, lifestyle, food
- **Categories supprimees** : sports_news, motorsport, combat_news, cycling, esports, wrestling, athletics, golf, tennis (remplaces par moteurs dedies ou contenu vide)

---

## FRONTEND — Navigation 3 niveaux

### Niveau 1 : Categories parents (5 boutons)
```
[🔥 All] [🏆 Sport] [₿ Crypto] [📰 News] [🎭 Entertainment]
```

### Niveau 2 : Sous-categories (apparaissent au click)
- **Sport** : Football, NBA, UFC/MMA, F1, NFL, NHL, Rugby, MotoGP, Tennis, Boxing, WWE
- **Crypto** : direct (pas de sous-categories)
- **News** : Trending, Politics, World, Science, Health, Crime, Planet, Business
- **Entertainment** : Music, Gaming, Movies, Drama, Food, Lifestyle

### Niveau 3 : Ligues (Football + Rugby uniquement)
Quand l'user clique sur Football ou Rugby :
1. Une barre de sous-filtres apparait avec les ligues detectees dans les predictions actives
2. Chaque pill a le drapeau du pays + nom de la ligue
3. Click sur une ligue = filtre
4. Par defaut "All" = predictions groupees par ligue avec headers dores

**Drapeaux** : Champions League (🏆), Premier League (🏴), La Liga (🇪🇸), Serie A (🇮🇹), Bundesliga (🇩🇪), Ligue 1 (🇫🇷), Top 14 (🇫🇷), Premiership (🏴), etc.

### Onglets supprimes (28/03/2026)
- ~~Boxing/UFC~~ → remplace par le nouveau moteur Boxing
- ~~Sport News~~ → remplace par les storylines Football + NBA
- ~~Motorsport~~ → remplace par F1 + MotoGP news-powered
- ~~Cycling~~ → contenu vide, pas de moteur dedie
- ~~Esports~~ → contenu vide, pas de moteur dedie
- ~~Wrestling~~ → remplace par le nouveau moteur WWE
- **Combat** renomme en **UFC/MMA**

---

## SCHEDULING — Qui tourne quand

| Quoi | Frequence | Trigger |
|------|-----------|---------|
| **API-Sports** (6 sports) | Lundi matin 6-10h UTC | `smartGenerate()` → `weeklySportsFetch()` |
| **MMA mid-week** | Jeudi/Vendredi (si < 3 combat preds) | `smartGenerate()` → `generateCombatLive()` |
| **Live sports** (F1, MotoGP, Tennis, Boxing, WWE, Storylines) | Toutes les 3h | `lightCycle()` → `liveSportsRefresh()` |
| **Crypto prix** | Toutes les 3h | `lightCycle()` → `generateCryptoLive()` |
| **News rotation** | Toutes les 3h (12 cycles propres) | `lightCycle()` → `generateFromNews()` |
| **Auto-resolve** | Toutes les 30 min | `resolveAll()` |
| **Emergency** | Toutes les heures | Si total preds < 5 → force weekly |
| **Broadcast** | 10h + 18h UTC | Top 3 predictions par votes |
| **Cleanup expired** | Toutes les 3h | `cleanupExpired()` |
| **Startup** | Au redeploy | Skip generation si 50+ preds actives (protege les quotas) |

**Rate limit weekly** : max 1 fetch API-Sports par 12h (cooldown global)
**MMA free plan** : acces limite a 3 jours → lundi fetch = lun-mer, jeudi fetch = jeu-sam (couvre le card UFC du weekend)

---

## AUTO-RESOLVE — Comment ca resout

| Sport | Methode | API |
|-------|---------|-----|
| Football | Score reel (FT, AET, PEN) | football.api-sports.io |
| NBA | Score reel (FT, AOT) | basketball.api-sports.io |
| Hockey | Score reel (FT, AOT, AP) | hockey.api-sports.io |
| NFL | Score reel (FT, AOT) | american-football.api-sports.io |
| Rugby | Score reel (FT) | rugby.api-sports.io |
| Crypto prix | Prix reel CoinGecko | coingecko.com |
| F1, MotoGP, Tennis, Boxing, WWE, News, Opinions | **Vote majoritaire** | — |

**Smart delay (fix du 28/03/2026) :**

PROBLEME : L'auto-resolve checkait les scores toutes les 30 min des que la prediction expirait (5 min avant kickoff). Pendant que le match se jouait, il spammait 6-12 appels API pour rien → 200-300 appels/jour → **compte API-Sports banni**.

FIX : Chaque sport a un delai intelligent avant le premier check :

| Sport | Duree match | Premier check apres kickoff |
|-------|------------|---------------------------|
| Football | ~2h | +2h30 |
| NBA | ~2h30 | +3h |
| Hockey | ~2h30 | +3h |
| NFL | ~3h30 | +4h |
| Rugby | ~2h | +2h30 |
| MMA | ~4h | +5h |

Resultat : 1-2 appels par match au lieu de 6-12. Fallback vote majoritaire apres 8h max sans reponse API.

**Ghost matches fix (28/03/2026 — meme session) :**

PROBLEME : Malgre le smart delay, des matchs de ligues mineures (England U18, Doncaster vs Hartpury, Llangennech vs Ystrad Rhondda) restaient bloques en status "NS" (Not Started) sur l'API meme des heures apres le kickoff prevu. L'auto-resolve les re-checkait toutes les 30 min indefiniment → Rugby a 66% du quota pour 3 matchs fantomes. Droit dans le mur vers un 2e ban.

CAUSE :
1. L'engine generait des predictions pour des ligues inconnues (U18, amateur, divisions inferieures) mal couvertes par l'API free
2. L'auto-resolve ne detectait pas les matchs fantomes (NS apres kickoff = l'API ne mettra jamais a jour)

FIX (3 couches) :
1. **Engine** : Football ne genere QUE pour les ligues connues (Tier 1/2/3, 36 ligues). Rugby QUE pour les top leagues (Top 14, Premiership, URC, Super Rugby, MLR, Top League Japan). Plus jamais de matchs amateur/U18.
2. **Auto-resolve skip** : Les 5 sports (Football, NBA, Hockey, NFL, Rugby) detectent les matchs NS/PST/CANC/TBD.
3. **Ghost match blacklist** (`ghostMatches` Set en memoire) : Quand un match retourne NS/PST/CANC, son ID est blackliste. Tous les checks suivants skipent AVANT l'appel API → **0 appel gaspille** apres la premiere detection. La blacklist vit en memoire (se reset au redeploy, ce qui est ok car le startup skip empeche la generation).

REGLE : **Ne JAMAIS generer de predictions pour des ligues qui ne sont pas dans nos listes whitelist. L'API free ne couvre pas les ligues mineures correctement → matchs fantomes → quota burn → ban.**

**Points** :
- Prediction reelle (score/prix) : +15 base + streak bonus (max 50)
- Prediction opinion : +10 base + streak bonus (max 50)
- Mauvaise reponse : streak reset a 0

---

## DEDUPLICATION — `addIfNotDupe()`

1. Compare les 30 premiers caracteres de la question (lowercase)
2. Compare les IDs : fixtureId, gameId, fightId, raceId + predType
3. Si doublon → skip, sinon → `db.addPrediction()`

---

## DATABASE — 4 tables

```sql
users        — id, username, first_name, points, streak, best_streak,
               total_predictions, correct_predictions, referred_by,
               referral_count, last_bonus_date, bonus_streak, chat_id

predictions  — id, question, category, option_a, option_b, emoji,
               votes_a, votes_b, resolved, result, expires_at,
               created_at, resolved_at, metadata (JSONB)

votes        — prediction_id + user_id (PK), choice, voted_at

comments     — id, prediction_id, user_id, username, first_name, text, created_at
```

**Indexes** : votes.user_id, votes.prediction_id, comments.prediction_id, predictions.resolved, predictions.expires_at

---

## SECURITE

- **Telegram HMAC-SHA256** validation sur chaque requete authentifiee
- **Rate limiting** par user : votes 30/min, comments 10/min, bonus 5/min, ads 10/min
- **Admin secret** pour les endpoints sensibles (resolve, generate, reset, broadcast)
- **Sanitize** : strip `<>` des inputs user
- **No duplicate votes** : PK constraint (prediction_id, user_id)

---

## MONETISATION

| Source | Status | Detail |
|--------|--------|--------|
| Monetag rewarded ads | ACTIF | +5 points par ad, cooldown 3 min |
| Monetag interstitial | ACTIF | Auto toutes les 2 pages |
| Bybit affiliate | En attente | — |

---

## ENVIRONMENT VARIABLES

```
BOT_TOKEN          — Telegram bot token (@BotFather)
DATABASE_URL       — Supabase PostgreSQL connection string
APP_URL            — Railway deployment URL
ADMIN_SECRET       — Secret pour les actions admin
FOOTBALL_API_KEY   — API-Sports (tous les sports sauf F1/MotoGP/Tennis/Boxing/WWE)
COINGECKO_API_KEY  — CoinGecko (optionnel, marche sans)
NEWS_API_KEY       — NewsData.io
```

---

## FICHIERS

```
server.js              — Express + Bot Telegram + API routes + auth + broadcast
predictions-engine.js  — Moteur de generation (~3300 lignes)
auto-resolve.js        — Resolution par vrais resultats (~570 lignes)
db.js                  — Couche database PostgreSQL (~280 lignes)
init-db.js             — Creation des tables
public/app.js          — Frontend (~1000 lignes)
public/index.html      — UI (5 tabs, 5 parents + sous-categories dynamiques)
public/style.css       — Dark theme, animations, responsive
package.json           — Dependencies (express, pg, dotenv, node-telegram-bot-api)
```

---

## QUOTA API — Estimation journaliere

| API | Appels/jour | Quota | Usage |
|-----|-------------|-------|-------|
| API-Sports | ~41 le lundi, ~15 jeu/ven (MMA), ~5-10 autres jours (auto-resolve) | 100/jour/sport | ~45% max |
| NewsData | ~85 (8 cycles x ~11 appels: 4 rotation + 7 live sports) | 200/jour | ~43% |
| CoinGecko | ~8 (toutes les 3h) | 30/min | negligeable |

**IMPORTANT — Compte API-Sports #4** (cle: `f4c2da...cabb`, compte Yo Maz). Les 3 premiers comptes ont ete bannis le 28/03/2026.

**REGLES QUOTA CRITIQUES** :
1. **Ne JAMAIS ajouter de ligues** sans verifier qu'elles sont bien couvertes par l'API free → matchs fantomes → quota burn → ban
2. **Ne JAMAIS forcer la generation au startup** si y'a deja des predictions → chaque redeploy = 1 cycle complet = ~11+ appels NewsData + potentiellement 41 appels API-Sports
3. **Ne JAMAIS laisser de categories mortes** dans la rotation NewsData → appels pour rien
4. **Toujours un `break` ou skip** quand l'API retourne une erreur (pas continuer a boucler)

---

## HISTORIQUE DES INCIDENTS

| Date | Incident | Cause | Fix |
|------|----------|-------|-----|
| 28/03/2026 | Compte API-Sports #1 banni | Auto-resolve spammait les scores pendant les matchs (6-12 appels/match) | Smart delay par sport + max retries + nouveau compte |
| 28/03/2026 | Rugby 66% quota (3 matchs) | Matchs de ligues mineures (amateur, U18) bloques en NS sur l'API → auto-resolve spam en boucle | Engine: whitelist ligues connues uniquement. Auto-resolve: skip NS/PST/CANC immediatement |
| 28/03/2026 | Compte API-Sports #2 banni | Ghost matches encore actifs + multiples redeploys forcant un weekly fetch (~41 appels chacun) | Startup skip si 50+ preds actives. Plus de forceWeekly au redeploy |
| 28/03/2026 | Compte API-Sports #3 banni | Le skip NS faisait l'appel API PUIS ignorait le resultat. Ghost matches brulaient encore du quota a chaque cycle | Ghost match blacklist: 1er appel = detection + blacklist, tous les suivants = 0 appel API |
| 28/03/2026 | NewsData quota cramer | 6 redeploys x 11 appels + categories mortes (golf, cycling, esports, athletics, etc.) dans la rotation = trop d'appels | Vire 4 cycles morts (15→12), startup skip, plus de categories fantomes |
| 28/03/2026 | WWE 0 predictions ever | Query NewsData cassee ("Raw wrestling" = phrase exacte), WrestleMania skip (21.2j > limite 21j), NXT Roadblock prioritise sur WrestleMania | Fix query (Raw OR wrestling), fenetre 28j, priorite mega > major > nxt |
| 28/03/2026 | MMA invisible en semaine | Free plan = 3 jours, weekly fetch lundi, UFC le samedi = hors range | Mid-week fetch jeudi/vendredi pour choper le card du weekend |

---

## FRONTEND — Trending Feed (28/03/2026)

La page "All" n'affiche plus les 600+ predictions d'un coup. A la place, un feed cure par sections :

```
🔥 HOT RIGHT NOW          → top 5 toutes categories (score: freshness + urgency + votes)
🏆 TRENDING SPORT         → top 5 sport
₿ TRENDING CRYPTO         → top 5 crypto
📰 TRENDING NEWS          → top 5 news
🎭 TRENDING ENTERTAINMENT → top 5 entertainment
```

**Hot score** = freshness (cree recemment) + urgency (expire bientot) + engagement (votes).
Le score scale automatiquement : sans users c'est base sur freshness/urgency, avec des users les votes prennent le dessus.
Les categories specifiques (Sport, Crypto, News, Entertainment) affichent toujours TOUTES les predictions comme avant.

---

## NEWS ROTATION — 12 cycles propres

Categories actives dans la rotation : crypto, musique, gaming, cinema, drama, politics, world, science, health, trending, crime, environment, business, lifestyle, food.

**Categories SUPPRIMEES** (28/03/2026) : sports_news, motorsport, golf, combat_news, cycling, wrestling, athletics, esports, education, tourism. Toutes remplacees par des moteurs dedies ou jamais utilisees.

**REGLE : ne JAMAIS ajouter une categorie dans la rotation sans verifier qu'elle a un bouton dans le frontend ET un MIN_SLOTS. Sinon c'est du quota brule pour des predictions invisibles.**

---

*Document mis a jour le 28 Mars 2026 — Version 2.3*
