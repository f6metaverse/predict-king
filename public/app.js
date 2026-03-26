// --- Telegram WebApp Init ---
const tg = window.Telegram?.WebApp;
let currentUser = null;
let currentCategory = 'all';

// Init
document.addEventListener('DOMContentLoaded', async () => {
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
  }

  await initUser();
  setupTabs();
  setupCategories();
  loadPredictions();
  checkDailyBonus();
  setupAdButton();
});

// --- User ---
async function initUser() {
  let userData;

  if (tg?.initDataUnsafe?.user) {
    userData = {
      id: tg.initDataUnsafe.user.id.toString(),
      username: tg.initDataUnsafe.user.username || '',
      firstName: tg.initDataUnsafe.user.first_name || 'Player'
    };
  } else {
    // Dev fallback
    userData = {
      id: 'dev_' + Math.random().toString(36).slice(2, 8),
      username: 'dev_user',
      firstName: 'Dev Player'
    };
  }

  // Check referral
  const startParam = tg?.initDataUnsafe?.start_param;
  if (startParam) {
    userData.referredBy = startParam;
  }

  try {
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    currentUser = await res.json();
    updateHeaderStats();
  } catch (e) {
    console.error('Failed to init user:', e);
    currentUser = userData;
  }
}

function updateHeaderStats() {
  if (!currentUser) return;
  document.getElementById('streakCount').textContent = currentUser.streak || 0;
  document.getElementById('pointsCount').textContent = currentUser.points || 0;
}

// --- Tabs ---
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      const screen = document.getElementById(`screen-${tab.dataset.tab}`);
      screen.classList.add('active');

      if (tab.dataset.tab === 'leaderboard') loadLeaderboard();
      if (tab.dataset.tab === 'history') loadHistory();
      if (tab.dataset.tab === 'profile') loadProfile();
      if (tab.dataset.tab === 'invite') loadInvite();

      if (tg) tg.HapticFeedback?.impactOccurred('light');
    });
  });
}

// --- Categories ---
function setupCategories() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      loadPredictions();
    });
  });
}

// --- Predictions ---
async function loadPredictions() {
  const list = document.getElementById('predictionsList');
  list.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

  try {
    const userId = currentUser?.id || '';
    const res = await fetch(`/api/predictions?userId=${userId}`);
    const predictions = await res.json();

    const filtered = currentCategory === 'all'
      ? predictions
      : predictions.filter(p => p.category === currentCategory);

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="emoji">🔮</div>
          <p>No predictions yet</p>
        </div>`;
      return;
    }

    list.innerHTML = filtered.map(p => renderPrediction(p)).join('');
    attachVoteListeners();
  } catch (e) {
    console.error('Failed to load predictions:', e);
    list.innerHTML = '<div class="empty-state"><p>Failed to load</p></div>';
  }
}

function renderPrediction(p) {
  const catClass = `cat-${p.category}`;
  const catLabels = {
    football: '⚽ Football',
    nba: '🏀 NBA',
    combat: '🥊 Combat',
    f1: '🏎️ F1',
    nfl: '🏈 NFL',
    hockey: '🏒 NHL',
    rugby: '🏉 Rugby',
    crypto: '₿ Crypto',
    musique: '🎵 Music',
    gaming: '🎮 Gaming',
    cinema: '🎬 Movies',
    drama: '👀 Drama',
    politics: '🏛️ Politics',
    world: '🌍 World',
    science: '🔬 Science',
    health: '💪 Health',
    trending: '🔥 Trending',
    crime: '🚨 Crime',
    environment: '🌱 Planet',
    business: '💼 Business',
    sports_news: '📰 Sport News',
    motorsport: '🏁 Motorsport',
    tennis: '🎾 Tennis',
    golf: '⛳ Golf',
    combat_news: '🥊 Boxing/UFC',
    wrestling: '💪 Wrestling',
    cycling: '🚴 Cycling',
    athletics: '🏃 Athletics',
    esports: '🕹 Esports',
    lifestyle: '✨ Lifestyle',
    food: '🍔 Food',
    education: '🎓 Education',
    tourism: '✈️ Tourism',
    general: '🔮 General'
  };

  const timeLeft = getTimeLeft(p.expiresAt);
  const hasVoted = p.userVote !== null;

  const isHot = p.totalVotes >= 10;
  const voteTeaser = !hasVoted && p.totalVotes > 0 ? `<p class="vote-teaser">${p.totalVotes} people already voted</p>` : '';

  return `
    <div class="prediction-card" data-id="${p.id}" data-expires="${p.expiresAt}">
      <div class="prediction-header">
        <span class="prediction-category ${catClass}">${catLabels[p.category] || catLabels.general}${isHot ? '<span class="hot-badge">HOT</span>' : ''}</span>
        <span class="prediction-timer">${timeLeft}</span>
      </div>
      <span class="prediction-emoji">${p.emoji}</span>
      <p class="prediction-question">${p.question}</p>
      ${voteTeaser}
      <div class="vote-buttons">
        <button class="vote-btn option-a ${hasVoted ? 'voted' : ''} ${hasVoted && p.userVote === 'A' ? 'selected-a' : ''} ${hasVoted && p.userVote !== 'A' ? 'not-selected' : ''}"
                data-prediction="${p.id}" data-choice="A">
          ${p.optionA}
        </button>
        <button class="vote-btn option-b ${hasVoted ? 'voted' : ''} ${hasVoted && p.userVote === 'B' ? 'selected-b' : ''} ${hasVoted && p.userVote !== 'B' ? 'not-selected' : ''}"
                data-prediction="${p.id}" data-choice="B">
          ${p.optionB}
        </button>
      </div>
      <div class="vote-results ${hasVoted ? 'show' : ''}" id="results-${p.id}">
        <div class="result-bar-container">
          <div class="result-bar-a" style="width: ${hasVoted ? p.percentA : 50}%"></div>
          <div class="result-bar-b" style="width: ${hasVoted ? p.percentB : 50}%"></div>
        </div>
        <div class="result-labels">
          <span class="result-label-a">${p.optionA} ${hasVoted ? p.percentA + '%' : ''}</span>
          <span class="result-label-b">${hasVoted ? p.percentB + '%' : ''} ${p.optionB}</span>
        </div>
        <p class="total-votes">${hasVoted ? p.totalVotes + ' votes' : ''}</p>
        ${hasVoted ? `<button class="share-btn" data-question="${encodeURIComponent(p.question)}" data-choice="${p.userVote === 'A' ? p.optionA : p.optionB}" data-percent="${p.userVote === 'A' ? p.percentA : p.percentB}">Share my prediction</button>` : ''}
      </div>
      ${hasVoted ? `
      <div class="comments-section" data-prediction="${p.id}">
        <button class="comments-toggle" data-prediction="${p.id}">
          <span>Comments</span>
          <span class="comments-count" id="count-${p.id}"></span>
        </button>
        <div class="comments-body" id="comments-${p.id}" style="display:none">
          <div class="comment-input-row">
            <input type="text" class="comment-input" id="input-${p.id}" placeholder="Drop your take..." maxlength="280">
            <button class="comment-send" data-prediction="${p.id}">Send</button>
          </div>
          <div class="comments-list" id="list-${p.id}"></div>
        </div>
      </div>
      ` : ''}
    </div>`;
}

function attachVoteListeners() {
  document.querySelectorAll('.vote-btn:not(.voted)').forEach(btn => {
    btn.addEventListener('click', () => vote(btn.dataset.prediction, btn.dataset.choice));
  });
  attachShareListeners();
  attachCommentListeners();
}

async function vote(predictionId, choice) {
  if (!currentUser) return;

  if (tg) tg.HapticFeedback?.impactOccurred('medium');

  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId,
        userId: currentUser.id,
        choice
      })
    });

    const data = await res.json();
    if (data.error) {
      console.error(data.error);
      return;
    }

    // Update UI
    const card = document.querySelector(`[data-id="${predictionId}"]`);
    const btnA = card.querySelector('.option-a');
    const btnB = card.querySelector('.option-b');

    btnA.classList.add('voted');
    btnB.classList.add('voted');

    if (choice === 'A') {
      btnA.classList.add('selected-a', 'just-voted');
      btnB.classList.add('not-selected');
    } else {
      btnB.classList.add('selected-b', 'just-voted');
      btnA.classList.add('not-selected');
    }

    // Show results
    const results = document.getElementById(`results-${predictionId}`);
    results.classList.add('show');
    results.querySelector('.result-bar-a').style.width = data.percentA + '%';
    results.querySelector('.result-bar-b').style.width = data.percentB + '%';

    const optionAText = btnA.textContent.trim();
    const optionBText = btnB.textContent.trim();

    const labels = results.querySelectorAll('.result-labels span');
    labels[0].textContent = optionAText + ' ' + data.percentA + '%';
    labels[1].textContent = data.percentB + '% ' + optionBText;
    results.querySelector('.total-votes').textContent = data.totalVotes + ' votes';

    // Inject share button
    const choiceLabel = choice === 'A' ? optionAText : optionBText;
    const choicePercent = choice === 'A' ? data.percentA : data.percentB;
    const question = card.querySelector('.prediction-question').textContent;

    if (!results.querySelector('.share-btn')) {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'share-btn';
      shareBtn.dataset.question = encodeURIComponent(question);
      shareBtn.dataset.choice = choiceLabel;
      shareBtn.dataset.percent = choicePercent;
      shareBtn.textContent = 'Share my prediction';
      results.appendChild(shareBtn);
    }

    // Inject comments section
    if (!card.querySelector('.comments-section')) {
      const commentsHTML = document.createElement('div');
      commentsHTML.className = 'comments-section';
      commentsHTML.dataset.prediction = predictionId;
      commentsHTML.innerHTML = `
        <button class="comments-toggle" data-prediction="${predictionId}">
          <span>Comments</span>
          <span class="comments-count" id="count-${predictionId}"></span>
        </button>
        <div class="comments-body" id="comments-${predictionId}" style="display:none">
          <div class="comment-input-row">
            <input type="text" class="comment-input" id="input-${predictionId}" placeholder="Drop your take..." maxlength="280">
            <button class="comment-send" data-prediction="${predictionId}">Send</button>
          </div>
          <div class="comments-list" id="list-${predictionId}"></div>
        </div>
      `;
      card.appendChild(commentsHTML);
    }

    // Remove vote teaser
    const teaser = card.querySelector('.vote-teaser');
    if (teaser) teaser.remove();

    // Remove just-voted animation
    setTimeout(() => {
      btnA.classList.remove('just-voted');
      btnB.classList.remove('just-voted');
    }, 600);

    // Update user stats
    currentUser.totalPredictions = (currentUser.totalPredictions || 0) + 1;

    // Milestone celebrations
    const total = currentUser.totalPredictions;
    if (total === 10 || total === 50 || total === 100 || total % 100 === 0) {
      launchConfetti();
      if (tg) tg.HapticFeedback?.notificationOccurred('success');
    }

    // Remove click listeners from voted buttons
    btnA.replaceWith(btnA.cloneNode(true));
    btnB.replaceWith(btnB.cloneNode(true));

    // Attach share + comment listeners
    attachShareListeners();
    attachCommentListeners();

  } catch (e) {
    console.error('Vote failed:', e);
  }
}

// --- Share ---
function attachShareListeners() {
  document.querySelectorAll('.share-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      const question = decodeURIComponent(newBtn.dataset.question);
      const choice = newBtn.dataset.choice;
      const percent = newBtn.dataset.percent;
      sharePrediction(question, choice, percent);
    });
  });
}

function sharePrediction(question, choice, percent) {
  if (tg) tg.HapticFeedback?.impactOccurred('medium');

  const botLink = `https://t.me/PredictKingAppBot`;
  const text = `PREDICT KING\n\n${question}\n\nI voted: ${choice} (${percent}% agree)\n\nWhat's your take? Tap to play:`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(botLink)}&text=${encodeURIComponent(text)}`;

  if (tg) {
    tg.openTelegramLink(shareUrl);
  } else {
    navigator.clipboard?.writeText(text + '\n' + botLink);
    alert('Link copied!');
  }
}

// --- Daily Bonus ---
async function checkDailyBonus() {
  if (!currentUser?.id) return;

  const lastBonus = localStorage.getItem(`pk_daily_${currentUser.id}`);
  const today = new Date().toDateString();

  if (lastBonus !== today) {
    try {
      const res = await fetch('/api/daily-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem(`pk_daily_${currentUser.id}`, today);
        currentUser.points = data.points;
        currentUser.streak = data.streak;
        updateHeaderStats();
        showDailyPopup(data.bonus, data.streak);
      }
    } catch (e) {
      console.error('Daily bonus error:', e);
    }
  }
}

function showDailyPopup(bonus, streak) {
  const popup = document.createElement('div');
  popup.className = 'daily-popup';
  popup.innerHTML = `
    <div class="daily-popup-content">
      <div class="daily-emoji">🎁</div>
      <h3>Daily Bonus!</h3>
      <p class="daily-points">+${bonus} points</p>
      <p class="daily-streak">Streak: ${streak} day${streak > 1 ? 's' : ''}</p>
      <p class="daily-tip">Come back tomorrow for even more!</p>
      <button class="daily-close" onclick="this.parentElement.parentElement.remove()">Let's go!</button>
    </div>
  `;
  document.getElementById('app').appendChild(popup);

  launchConfetti();
  if (tg) tg.HapticFeedback?.notificationOccurred('success');
}

// --- Leaderboard ---
async function loadLeaderboard() {
  const list = document.getElementById('leaderboardList');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await fetch('/api/leaderboard');
    const users = await res.json();

    if (users.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="emoji">🏆</div><p>No players yet</p></div>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = users.map((u, i) => `
      <div class="lb-item ${i < 3 ? 'top-' + (i + 1) : ''}" style="animation-delay: ${i * 0.05}s">
        <span class="lb-rank ${i >= 3 ? 'num' : ''}">${medals[i] || (i + 1)}</span>
        <div class="lb-info">
          <div class="lb-name">${u.firstName}${u.id === currentUser?.id ? ' (you)' : ''}</div>
          <div class="lb-stats">🔥 ${u.streak || 0} streak | ✅ ${u.correctPredictions || 0} correct</div>
        </div>
        <span class="lb-points">⭐ ${u.points}</span>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Failed to load</p></div>';
  }
}

// --- Profile ---
async function loadProfile() {
  if (!currentUser?.id) return;

  try {
    const res = await fetch(`/api/user/${currentUser.id}`);
    const user = await res.json();
    currentUser = { ...currentUser, ...user };

    document.getElementById('profileName').textContent = user.firstName || 'Player';
    document.getElementById('statPoints').textContent = user.points || 0;
    document.getElementById('statStreak').textContent = user.streak || 0;
    document.getElementById('statBestStreak').textContent = user.bestStreak || 0;
    document.getElementById('statTotal').textContent = user.totalPredictions || 0;
    document.getElementById('statCorrect').textContent = user.correctPredictions || 0;
    document.getElementById('statReferrals').textContent = user.referralCount || 0;

    const accuracy = user.totalPredictions > 0
      ? Math.round((user.correctPredictions / user.totalPredictions) * 100)
      : 0;
    document.getElementById('statAccuracy').textContent = accuracy + '%';

    // Rank
    const rank = getRank(user.points || 0);
    document.getElementById('profileRank').textContent = rank;

    updateHeaderStats();
  } catch (e) {
    console.error('Failed to load profile:', e);
  }
}

function getRank(points) {
  if (points >= 5000) return '👑 Legend';
  if (points >= 2000) return '💎 Diamond';
  if (points >= 1000) return '🏆 Gold';
  if (points >= 500) return '🥈 Silver';
  if (points >= 100) return '🥉 Bronze';
  return '🆕 Rookie';
}

// --- History ---
async function loadHistory() {
  if (!currentUser?.id) return;

  const list = document.getElementById('historyList');
  const stats = document.getElementById('historyStats');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const res = await fetch(`/api/history/${currentUser.id}`);
    const history = await res.json();

    if (history.length === 0) {
      stats.innerHTML = '';
      list.innerHTML = '<div class="empty-state"><div class="emoji">📋</div><p>No predictions yet. Go vote!</p></div>';
      return;
    }

    const wins = history.filter(h => h.won === true).length;
    const losses = history.filter(h => h.won === false).length;
    const pending = history.filter(h => h.won === null).length;

    stats.innerHTML = `
      <div class="history-stat-row">
        <div class="history-stat won"><span>${wins}</span><label>Won</label></div>
        <div class="history-stat lost"><span>${losses}</span><label>Lost</label></div>
        <div class="history-stat pending"><span>${pending}</span><label>Pending</label></div>
      </div>
    `;

    list.innerHTML = history.map(h => {
      const choiceLabel = h.userChoice === 'A' ? h.optionA : h.optionB;
      let statusClass = 'pending';
      let statusIcon = '...';
      let statusText = 'Pending';

      if (h.won === true) {
        statusClass = 'won';
        statusIcon = '+';
        statusText = 'Won';
      } else if (h.won === false) {
        statusClass = 'lost';
        statusIcon = 'x';
        statusText = 'Lost';
      }

      return `
        <div class="history-item ${statusClass}">
          <div class="history-status-badge ${statusClass}">${statusIcon}</div>
          <div class="history-info">
            <p class="history-question">${h.question}</p>
            <p class="history-choice">You voted: <strong>${choiceLabel}</strong></p>
          </div>
          <div class="history-result ${statusClass}">${statusText}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Failed to load</p></div>';
  }
}

// --- Invite ---
function loadInvite() {
  if (!currentUser) return;

  document.getElementById('inviteCount').textContent = currentUser.referralCount || 0;
  document.getElementById('invitePoints').textContent = ((currentUser.referralCount || 0) * 50);

  const btnInvite = document.getElementById('btnInvite');
  // Remove old listeners by cloning
  const newBtn = btnInvite.cloneNode(true);
  btnInvite.parentNode.replaceChild(newBtn, btnInvite);

  newBtn.addEventListener('click', () => {
    const link = `https://t.me/PredictKingAppBot?start=${currentUser.id}`;
    const text = `👑 Join PREDICT KING! Make predictions on sports, crypto & pop culture. Earn points and become the prediction king!\n\n🎮 Play now:`;

    if (tg) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    } else {
      navigator.clipboard?.writeText(link);
      alert('Lien copie !');
    }

    if (tg) tg.HapticFeedback?.impactOccurred('medium');
  });
}

// --- In-App Interstitial (auto ads, passive revenue) ---
function startAutoAds() {
  if (typeof show_10775336 === 'function') {
    show_10775336({
      type: 'inApp',
      inAppSettings: {
        frequency: 2,
        capping: 0.1,
        interval: 30,
        timeout: 5,
        everyPage: false
      }
    });
  }
}
setTimeout(startAutoAds, 8000);

// --- Rewarded Ad ---
function setupAdButton() {
  const btn = document.getElementById('watchAdBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!currentUser) return;

    // Check cooldown (1 ad per 3 minutes)
    const lastAd = localStorage.getItem(`pk_ad_${currentUser.id}`);
    const now = Date.now();
    if (lastAd && now - parseInt(lastAd) < 180000) {
      const wait = Math.ceil((180000 - (now - parseInt(lastAd))) / 1000);
      btn.querySelector('span:last-child').innerHTML = `Wait ${wait}s...`;
      setTimeout(() => {
        btn.querySelector('span:last-child').innerHTML = 'Watch ad = <strong>+5 points</strong>';
      }, 2000);
      return;
    }

    btn.disabled = true;
    btn.querySelector('span:last-child').innerHTML = 'Loading ad...';

    try {
      if (typeof show_10775336 === 'function') {
        await show_10775336();
        // Ad watched successfully, reward the user
        const res = await fetch('/api/ad-reward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id })
        });
        const data = await res.json();
        if (data.success) {
          currentUser.points = data.points;
          updateHeaderStats();
          localStorage.setItem(`pk_ad_${currentUser.id}`, now.toString());
          btn.querySelector('span:last-child').innerHTML = '<strong>+5 points!</strong>';
          if (tg) tg.HapticFeedback?.notificationOccurred('success');
          setTimeout(() => {
            btn.querySelector('span:last-child').innerHTML = 'Watch ad = <strong>+5 points</strong>';
          }, 2000);
        }
      } else {
        btn.querySelector('span:last-child').innerHTML = 'Ad not available';
        setTimeout(() => {
          btn.querySelector('span:last-child').innerHTML = 'Watch ad = <strong>+5 points</strong>';
        }, 2000);
      }
    } catch (e) {
      console.error('Ad error:', e);
      btn.querySelector('span:last-child').innerHTML = 'Try again later';
      setTimeout(() => {
        btn.querySelector('span:last-child').innerHTML = 'Watch ad = <strong>+5 points</strong>';
      }, 2000);
    }

    btn.disabled = false;
  });
}

// --- Comments ---
function attachCommentListeners() {
  document.querySelectorAll('.comments-toggle').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      const pid = newBtn.dataset.prediction;
      const body = document.getElementById(`comments-${pid}`);
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) loadComments(pid);
      if (tg) tg.HapticFeedback?.impactOccurred('light');
    });
  });

  document.querySelectorAll('.comment-send').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      postComment(newBtn.dataset.prediction);
    });
  });

  document.querySelectorAll('.comment-input').forEach(input => {
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const pid = newInput.id.replace('input-', '');
        postComment(pid);
      }
    });
  });
}

async function loadComments(predictionId) {
  const list = document.getElementById(`list-${predictionId}`);
  list.innerHTML = '<div class="loading-comments">Loading...</div>';

  try {
    const res = await fetch(`/api/comments/${predictionId}`);
    const comments = await res.json();

    const countEl = document.getElementById(`count-${predictionId}`);
    if (countEl) countEl.textContent = comments.length > 0 ? `(${comments.length})` : '';

    if (comments.length === 0) {
      list.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
      return;
    }

    list.innerHTML = comments.map(c => `
      <div class="comment">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(c.firstName)}</span>
          <span class="comment-time">${timeAgo(c.createdAt)}</span>
        </div>
        <p class="comment-text">${escapeHtml(c.text)}</p>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<p class="no-comments">Failed to load</p>';
  }
}

async function postComment(predictionId) {
  if (!currentUser) return;

  const input = document.getElementById(`input-${predictionId}`);
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;

  try {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId,
        userId: currentUser.id,
        text
      })
    });

    const data = await res.json();
    if (data.error) {
      console.error(data.error);
      input.disabled = false;
      return;
    }

    input.value = '';
    input.disabled = false;
    if (tg) tg.HapticFeedback?.impactOccurred('light');
    loadComments(predictionId);
  } catch (e) {
    console.error('Post comment failed:', e);
    input.disabled = false;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now - d) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// --- Confetti ---
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.id = 'confettiCanvas';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#fbbf24', '#7c3aed', '#10b981', '#ef4444', '#3b82f6', '#f97316'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 100,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10
    });
  }

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.rot += p.rotSpeed;

      if (p.y < canvas.height + 20) alive = true;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    frame++;
    if (alive && frame < 180) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }
  animate();
}

// --- Live Timer ---
function startLiveTimers() {
  setInterval(() => {
    document.querySelectorAll('.prediction-timer').forEach(el => {
      const card = el.closest('.prediction-card');
      if (!card) return;
      const expiresAt = card.dataset.expires;
      if (expiresAt) el.textContent = getTimeLeft(expiresAt);
    });
  }, 30000); // Update every 30 seconds
}
startLiveTimers();

// --- Utils ---
function getTimeLeft(expiresAt) {
  const now = new Date();
  const end = new Date(expiresAt);
  const diff = end - now;

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}
