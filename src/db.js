'use strict';

const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { DB_PATH, ADMIN_USERNAME, ADMIN_PASSWORD } = require('./config');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA synchronous = NORMAL');

db.transaction = (fn) => (...args) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(...args);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* */ }
    throw err;
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  country TEXT NOT NULL,
  phone TEXT,
  balance_kobo INTEGER NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0),
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  voice_on INTEGER NOT NULL DEFAULT 1,
  music_on INTEGER NOT NULL DEFAULT 1,
  withdraw_blocked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT,
  last_ip TEXT
);

CREATE TABLE IF NOT EXISTS house_wallet (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  balance_kobo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount_kobo INTEGER NOT NULL,
  type TEXT NOT NULL,
  ref TEXT NOT NULL UNIQUE,
  game_id INTEGER,
  meta TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type, created_at);

CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  reference TEXT NOT NULL UNIQUE,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status, created_at);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by INTEGER,
  admin_note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  bet_kobo INTEGER NOT NULL DEFAULT 0,
  host_id INTEGER,
  winner_id INTEGER,
  rake_kobo INTEGER NOT NULL DEFAULT 0,
  pot_kobo INTEGER NOT NULL DEFAULT 0,
  state_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  seat INTEGER NOT NULL,
  result TEXT,
  payout_kobo INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user INTEGER NOT NULL,
  to_user INTEGER NOT NULL,
  bet_kobo INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'versus',
  tournament_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  game_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (from_user) REFERENCES users(id),
  FOREIGN KEY (to_user) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'info',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

db.prepare('INSERT OR IGNORE INTO house_wallet (id, balance_kobo) VALUES (1, 0)').run();

const defaultSettings = {
  deposit_bank_name: 'Not set',
  deposit_account_number: '0000000000',
  deposit_account_name: '9jaWhot Deposits',
  rake_bank_name: 'Not set',
  rake_account_number: '0000000000',
  rake_account_name: '9jaWhot House',
};
const insSet = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultSettings)) insSet.run(k, v);

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (existing) return;
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  db.prepare(
    `INSERT INTO users (username, email, password_hash, country, is_admin, voice_on, music_on)
     VALUES (?, ?, ?, 'NG', 1, 1, 1)`
  ).run(ADMIN_USERNAME, 'admin@9jawhot.local', hash);
  console.log(`Admin seeded → username: ${ADMIN_USERNAME}`);
}
seedAdmin();

function newRef(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`.toUpperCase();
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    country: u.country,
    phone: u.phone,
    balance_kobo: u.balance_kobo,
    is_admin: !!u.is_admin,
    voice_on: !!u.voice_on,
    music_on: !!u.music_on,
    created_at: u.created_at,
  };
}

function applyLedger(conn, { userId, amountKobo, type, ref, gameId = null, meta = null, createdBy = null, ip = null }) {
  conn.prepare(
    `INSERT INTO ledger (user_id, amount_kobo, type, ref, game_id, meta, created_by, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, amountKobo, type, ref, gameId, meta ? JSON.stringify(meta) : null, createdBy, ip);

  if (userId === 0) {
    conn.prepare('UPDATE house_wallet SET balance_kobo = balance_kobo + ? WHERE id = 1').run(amountKobo);
    return;
  }

  if (amountKobo < 0) {
    const r = conn.prepare(
      `UPDATE users SET balance_kobo = balance_kobo + ?
       WHERE id = ? AND is_banned = 0 AND balance_kobo >= ?`
    ).run(amountKobo, userId, -amountKobo);
    if (r.changes !== 1) {
      const err = new Error('Insufficient balance or account locked');
      err.status = 400;
      throw err;
    }
  } else {
    const r = conn.prepare('UPDATE users SET balance_kobo = balance_kobo + ? WHERE id = ?').run(amountKobo, userId);
    if (r.changes !== 1) throw new Error('Balance credit failed');
  }
}

function audit(actorId, action, target, meta, ip) {
  db.prepare('INSERT INTO audit (actor_id, action, target, meta, ip) VALUES (?, ?, ?, ?, ?)').run(
    actorId || null,
    action,
    target || null,
    meta ? JSON.stringify(meta) : null,
    ip || null
  );
}

function notify(userId, title, body, kind = 'info') {
  db.prepare('INSERT INTO notifications (user_id, title, body, kind) VALUES (?, ?, ?, ?)').run(userId, title, body, kind);
}

function reconcile() {
  const users = db.prepare('SELECT id, username, balance_kobo FROM users').all();
  const issues = [];
  for (const u of users) {
    const sum = db.prepare('SELECT COALESCE(SUM(amount_kobo),0) AS s FROM ledger WHERE user_id = ?').get(u.id).s;
    if (sum !== u.balance_kobo) {
      issues.push({ userId: u.id, username: u.username, balance: u.balance_kobo, ledger: sum });
    }
  }
  const house = db.prepare('SELECT balance_kobo FROM house_wallet WHERE id = 1').get();
  const houseLedger = db.prepare("SELECT COALESCE(SUM(amount_kobo),0) AS s FROM ledger WHERE user_id = 0").get().s;
  if (house.balance_kobo !== houseLedger) {
    issues.push({ userId: 0, username: 'HOUSE', balance: house.balance_kobo, ledger: houseLedger });
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  db,
  newRef,
  getSetting,
  getSettings,
  setSetting,
  publicUser,
  applyLedger,
  audit,
  notify,
  reconcile,
};
