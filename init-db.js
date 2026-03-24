require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('Creating tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT DEFAULT '',
        first_name TEXT DEFAULT '',
        points INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        total_predictions INTEGER DEFAULT 0,
        correct_predictions INTEGER DEFAULT 0,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        last_active_at TIMESTAMPTZ DEFAULT NOW(),
        referred_by TEXT,
        referral_count INTEGER DEFAULT 0,
        last_bonus_date TEXT,
        bonus_streak INTEGER DEFAULT 0
      );
    `);
    console.log('  users table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        emoji TEXT DEFAULT '',
        votes_a INTEGER DEFAULT 0,
        votes_b INTEGER DEFAULT 0,
        resolved BOOLEAN DEFAULT FALSE,
        result TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );
    `);
    console.log('  predictions table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS votes (
        prediction_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        choice TEXT NOT NULL,
        voted_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (prediction_id, user_id)
      );
    `);
    console.log('  votes table OK');

    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        prediction_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT DEFAULT '',
        first_name TEXT DEFAULT '',
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  comments table OK');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);
      CREATE INDEX IF NOT EXISTS idx_votes_prediction ON votes(prediction_id);
      CREATE INDEX IF NOT EXISTS idx_comments_prediction ON comments(prediction_id);
      CREATE INDEX IF NOT EXISTS idx_predictions_resolved ON predictions(resolved);
      CREATE INDEX IF NOT EXISTS idx_predictions_expires ON predictions(expires_at);
    `);
    console.log('  indexes OK');

    console.log('\nAll tables created successfully!');
  } catch (e) {
    console.error('Error creating tables:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase();
