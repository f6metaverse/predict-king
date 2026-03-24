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
    general: '🔮 General'
  };

  const timeLeft = getTimeLeft(p.expiresAt);
  const hasVoted = p.userVote !== null;

  return `
    <div class="prediction-card" data-id="${p.id}">
      <div class="prediction-header">
        <span class="prediction-category ${catClass}">${catLabels[p.category] || catLabels.general}</span>
        <span class="prediction-timer">⏰ ${timeLeft}</span>
      </div>
      <span class="prediction-emoji">${p.emoji}</span>
      <p class="prediction-question">${p.question}</p>
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
        ${hasVoted ? `<button class="share-btn" data-question="${encodeURIComponent(p.question)}" data-choice="${p.userVote === 'A' ? p.optionA : p.optionB}" data-percent="${p.userVote === 'A' ? p.percentA : p.percentB}">📤 Share my prediction</button>` : ''}
      </div>
    </div>`;
}

function attachVoteListeners() {
  document.querySelectorAll('.vote-btn:not(.voted)').forEach(btn => {
    btn.addEventListener('click', () => vote(btn.dataset.prediction, btn.dataset.choice));
  });
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

    const labels = results.querySelectorAll('.result-labels span');
    labels[0].textContent = btnA.textContent.trim() + ' ' + data.percentA + '%';
    labels[1].textContent = data.percentB + '% ' + btnB.textContent.trim();
    results.querySelector('.total-votes').textContent = data.totalVotes + ' votes';

    // Remove just-voted animation
    setTimeout(() => {
      btnA.classList.remove('just-voted');
      btnB.classList.remove('just-voted');
    }, 400);

    // Update user stats
    currentUser.totalPredictions = (currentUser.totalPredictions || 0) + 1;

    // Remove click listeners from voted buttons
    btnA.replaceWith(btnA.cloneNode(true));
    btnB.replaceWith(btnB.cloneNode(true));

    // Attach share listeners
    attachShareListeners();

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
  if (tg) tg.HapticFeedback?.impactOccurred('light');

  const text = `👑 PREDICT KING\n\n🔮 ${question}\n\n✅ I voted: ${choice} (${percent}% agree)\n\nWhat do you think? Come vote!`;
  const url = `https://t.me/PredictKingAppBot`;

  if (tg) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  } else {
    navigator.clipboard?.writeText(text + '\n' + url);
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
      <p class="daily-streak">🔥 Streak: ${streak} day${streak > 1 ? 's' : ''}</p>
      <p class="daily-tip">Come back tomorrow for even more!</p>
      <button class="daily-close" onclick="this.parentElement.parentElement.remove()">Let's go!</button>
    </div>
  `;
  document.getElementById('app').appendChild(popup);

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

// --- Utils ---
function getTimeLeft(expiresAt) {
  const now = new Date();
  const end = new Date(expiresAt);
  const diff = end - now;

  if (diff <= 0) return 'Ended';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d left`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
