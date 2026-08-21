'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { PORT, JWT_SECRET, MIN_BET_KOBO, MIN_WITHDRAW_KOBO, MAX_PENDING_WITHDRAWALS } = require('./src/config');
const { COUNTRIES, isValidCountry } = require('./src/countries');
const { nairaToKobo, formatNGN, settlePayout, assertBet } = require('./src/money');
const { db, newRef, getSettings, setSetting, publicUser, applyLedger, audit, notify, reconcile } = require('./src/db');
const { WhotGame, SUITS } = require('./src/whot');
const { pickBotMove } = require('./src/ai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  frameguard: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      frameAncestors: ['*'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', extensions: ['html'] }));

const globalLimiter = rateLimit({ windowMs: 60_000, max: 180, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30, message: { error: 'Too many attempts. Wait and try again.' } });
const moneyLimiter = rateLimit({ windowMs: 60_000, max: 20, message: { error: 'Slow down.' } });
app.use('/api/', globalLimiter);

function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 64);
}

function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.is_admin ? 'admin' : 'user', v: user.token_version || 0 },
    JWT_SECRET,
    { expiresIn: '7d', issuer: '9jawhot' }
  );
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in required' });
  try {
    const p = jwt.verify(h.slice(7), JWT_SECRET, { issuer: '9jawhot' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(p.uid);
    if (!user || user.is_banned) return res.status(401).json({ error: 'Account unavailable' });
    if ((user.token_version || 0) !== p.v) return res.status(401).json({ error: 'Session expired' });
    req.user = user;
    req.ipAddr = ipOf(req);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

function safe(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.status ? err.message : 'Something went wrong' });
  });
}

function validUsername(u) {
  return /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(u || '');
}
function validPassword(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);
}
function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 120;
}

const liveGames = new Map();
const online = new Map();
const botBusy = new Set();
const TURN_MS = 45_000;

function persistGame(g) {
  db.prepare('UPDATE games SET status = ?, winner_id = ?, state_json = ?, finished_at = CASE WHEN ? = \'finished\' THEN datetime(\'now\') ELSE finished_at END WHERE id = ?')
    .run(g.status, g.winnerId, g.serialize(), g.status, g.id);
}

function broadcastGame(g) {
  for (const p of g.players) {
    if (p.userId > 0) io.to(`user:${p.userId}`).emit('game_state', g.publicState(p.userId));
  }
}

function emitToUser(userId, ev, payload) {
  io.to(`user:${userId}`).emit(ev, payload);
}

function settleFinished(g) {
  if (g.status !== 'finished' || !g.winnerId) return;
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(g.id);
  if (!row || row.status === 'settled' || row.status === 'finished' && row.winner_id && row.rake_kobo && g.betKobo > 0 && row.finished_at) {
    /* continue if already settled via rake recorded */
  }
  const already = db.prepare("SELECT 1 FROM ledger WHERE game_id = ? AND type = 'bet_win' LIMIT 1").get(g.id);
  if (already) {
    persistGame(g);
    broadcastGame(g);
    return;
  }

  const humans = g.players.filter((p) => p.userId > 0);
  if (g.betKobo <= 0 || humans.length < 2) {
    db.prepare("UPDATE games SET status = 'finished', winner_id = ?, finished_at = datetime('now'), state_json = ? WHERE id = ?")
      .run(g.winnerId, g.serialize(), g.id);
    db.prepare('UPDATE game_players SET result = CASE WHEN user_id = ? THEN \'win\' ELSE \'lose\' END WHERE game_id = ?')
      .run(g.winnerId, g.id);
    broadcastGame(g);
    emitToUser(g.winnerId, 'toast', { kind: 'win', text: 'You win!' });
    return;
  }

  const losers = humans.filter((p) => p.userId !== g.winnerId);
  const { houseRake, winnerPayout } = settlePayout(g.betKobo, losers.length);

  const tx = db.transaction(() => {
    applyLedger(db, {
      userId: g.winnerId,
      amountKobo: winnerPayout,
      type: 'bet_win',
      ref: newRef('WIN'),
      gameId: g.id,
      meta: { losers: losers.length, stake: g.betKobo },
    });
    applyLedger(db, {
      userId: 0,
      amountKobo: houseRake,
      type: 'rake',
      ref: newRef('RAKE'),
      gameId: g.id,
      meta: { pct: 5, losers: losers.length },
    });
    db.prepare("UPDATE games SET status = 'finished', winner_id = ?, rake_kobo = ?, finished_at = datetime('now'), state_json = ? WHERE id = ?")
      .run(g.winnerId, houseRake, g.serialize(), g.id);
    db.prepare('UPDATE game_players SET result = \'lose\' WHERE game_id = ?').run(g.id);
    db.prepare('UPDATE game_players SET result = \'win\', payout_kobo = ? WHERE game_id = ? AND user_id = ?')
      .run(winnerPayout, g.id, g.winnerId);
  });
  tx();

  const winner = db.prepare('SELECT username, balance_kobo FROM users WHERE id = ?').get(g.winnerId);
  notify(g.winnerId, 'You won', `Payout ${formatNGN(winnerPayout)} credited.`, 'win');
  for (const l of losers) notify(l.userId, 'Table lost', `Stake ${formatNGN(g.betKobo)} settled.`, 'lose');
  emitToUser(g.winnerId, 'wallet', { balance_kobo: winner.balance_kobo });
  emitToUser(g.winnerId, 'toast', { kind: 'win', text: `You won ${formatNGN(winnerPayout)}` });
  for (const l of losers) {
    const u = db.prepare('SELECT balance_kobo FROM users WHERE id = ?').get(l.userId);
    emitToUser(l.userId, 'wallet', { balance_kobo: u.balance_kobo });
    emitToUser(l.userId, 'toast', { kind: 'lose', text: 'That hand is gone.' });
  }
  broadcastGame(g);
  audit(null, 'game_settle', String(g.id), { winner: g.winnerId, rake: houseRake, payout: winnerPayout }, null);
}

function afterMove(g) {
  persistGame(g);
  broadcastGame(g);
  if (g.status === 'finished') {
    settleFinished(g);
    return;
  }
  maybeBot(g);
}

function maybeBot(g) {
  if (g.status !== 'playing') return;
  const cur = g.current;
  if (!cur?.isBot) return;
  if (botBusy.has(g.id)) return;
  botBusy.add(g.id);
  setTimeout(() => {
    botBusy.delete(g.id);
    const live = liveGames.get(g.id);
    if (!live || live.status !== 'playing') return;
    if (live.current.userId !== cur.userId) return;
    const mv = pickBotMove(live, cur.userId);
    try {
      if (mv.type === 'play') live.playCard(cur.userId, mv.cardId, mv.extra || {});
      else live.drawMarket(cur.userId);
    } catch {
      try { live.drawMarket(cur.userId); } catch { /* empty market */ }
    }
    afterMove(live);
  }, 750 + Math.floor(Math.random() * 900));
}

function lockStakes(playerIds, betKobo, gameId) {
  const tx = db.transaction(() => {
    for (const uid of playerIds) {
      applyLedger(db, {
        userId: uid,
        amountKobo: -betKobo,
        type: 'bet_lock',
        ref: newRef('BET'),
        gameId,
        meta: { gameId },
      });
    }
  });
  tx();
}

function createLiveGame({ type, hostId, playerInfos, betKobo }) {
  const info = db.prepare(
    `INSERT INTO games (type, status, bet_kobo, host_id, pot_kobo, state_json) VALUES (?, 'playing', ?, ?, ?, '{}')`
  ).run(type, betKobo, hostId, betKobo * playerInfos.filter((p) => p.userId > 0).length);
  const id = Number(info.lastInsertRowid);
  const g = new WhotGame({ id, type, playerInfos, betKobo });
  const ins = db.prepare('INSERT INTO game_players (game_id, user_id, seat) VALUES (?, ?, ?)');
  playerInfos.forEach((p, i) => {
    if (p.userId > 0) ins.run(id, p.userId, i);
  });
  liveGames.set(id, g);
  persistGame(g);
  return g;
}

/* ---------------- public ---------------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: '9jaWhot', time: new Date().toISOString() });
});
app.get('/api/countries', (req, res) => res.json(COUNTRIES));
app.get('/api/public/bank', (req, res) => {
  const s = getSettings();
  res.json({
    bank_name: s.deposit_bank_name,
    account_number: s.deposit_account_number,
    account_name: s.deposit_account_name,
  });
});

/* ---------------- auth ---------------- */
app.post('/api/auth/register', authLimiter, safe(async (req, res) => {
  const { username, password, country, email, phone, age18, terms } = req.body || {};
  if (age18 !== true) return res.status(400).json({ error: 'You must be 18 or older' });
  if (terms !== true) return res.status(400).json({ error: 'Accept the Terms, including the 5% house commission, to create an account' });
  if (!validUsername(username)) return res.status(400).json({ error: 'Username: 3–20 letters, numbers, underscore. Start with a letter.' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 8+ characters with a letter and a number' });
  if (!isValidCountry(country)) return res.status(400).json({ error: 'Pick a valid country' });
  if (email && !validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare(
      `INSERT INTO users (username, email, password_hash, country, phone) VALUES (?, ?, ?, ?, ?)`
    ).run(username.trim(), email ? String(email).toLowerCase() : null, hash, String(country).toUpperCase(), phone ? String(phone).slice(0, 24) : null);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    audit(user.id, 'register', null, { country: user.country }, ipOf(req));
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username or email already taken' });
    throw e;
  }
}));

app.post('/api/auth/login', authLimiter, safe(async (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username || '').trim());
  if (!user) return res.status(401).json({ error: 'Wrong username or password' });
  if (user.is_banned) return res.status(403).json({ error: 'Account suspended' });
  if (user.locked_until && new Date(user.locked_until + 'Z') > new Date()) {
    return res.status(423).json({ error: 'Account temporarily locked. Try later.' });
  }
  const ok = bcrypt.compareSync(String(password || ''), user.password_hash);
  if (!ok) {
    const fails = user.failed_logins + 1;
    const lock = fails >= 8 ? new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 19).replace('T', ' ') : null;
    db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(fails, lock, user.id);
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = datetime(\'now\'), last_ip = ? WHERE id = ?')
    .run(ipOf(req), user.id);
  audit(user.id, 'login', null, null, ipOf(req));
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ token: signToken(fresh), user: publicUser(fresh) });
}));

app.get('/api/me', auth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(u), online: online.has(u.id) });
});

app.post('/api/me/settings', auth, (req, res) => {
  const voice = req.body.voice_on ? 1 : 0;
  const music = req.body.music_on ? 1 : 0;
  db.prepare('UPDATE users SET voice_on = ?, music_on = ? WHERE id = ?').run(voice, music, req.user.id);
  res.json({ voice_on: !!voice, music_on: !!music });
});

app.post('/api/me/password', auth, authLimiter, safe(async (req, res) => {
  const { current, next } = req.body || {};
  if (!validPassword(next)) return res.status(400).json({ error: 'New password must be 8+ with a letter and a number' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(current || ''), user.password_hash)) return res.status(400).json({ error: 'Current password is wrong' });
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(bcrypt.hashSync(next, 10), user.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  audit(user.id, 'password_change', null, null, ipOf(req));
  res.json({ token: signToken(fresh), ok: true });
}));

app.get('/api/users/search', auth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const rows = db.prepare(
    `SELECT id, username, country FROM users
     WHERE is_banned = 0 AND is_admin = 0 AND id != ? AND username LIKE ? COLLATE NOCASE
     LIMIT 12`
  ).all(req.user.id, `%${q.replace(/[%_]/g, '')}%`);
  res.json(rows.map((r) => ({ ...r, online: online.has(r.id) })));
});

app.get('/api/users/:username', auth, (req, res) => {
  const u = db.prepare('SELECT id, username, country, created_at FROM users WHERE username = ? COLLATE NOCASE AND is_banned = 0')
    .get(req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ ...u, online: online.has(u.id) });
});

/* ---------------- wallet ---------------- */
app.get('/api/wallet', auth, (req, res) => {
  const u = db.prepare('SELECT balance_kobo FROM users WHERE id = ?').get(req.user.id);
  const ledger = db.prepare(
    `SELECT id, amount_kobo, type, ref, game_id, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 40`
  ).all(req.user.id);
  const deposits = db.prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(req.user.id);
  const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(req.user.id);
  const s = getSettings();
  res.json({
    balance_kobo: u.balance_kobo,
    balance: formatNGN(u.balance_kobo),
    ledger,
    deposits,
    withdrawals,
    deposit_bank: {
      bank_name: s.deposit_bank_name,
      account_number: s.deposit_account_number,
      account_name: s.deposit_account_name,
    },
  });
});

app.post('/api/wallet/deposit', auth, moneyLimiter, (req, res) => {
  let amount;
  try { amount = nairaToKobo(req.body.amount); } catch { return res.status(400).json({ error: 'Invalid amount' }); }
  if (amount < MIN_BET_KOBO) return res.status(400).json({ error: 'Minimum deposit is ₦100' });
  if (amount > 20_000_000_00) return res.status(400).json({ error: 'Amount too large' });
  const note = String(req.body.note || '').slice(0, 160);
  const reference = newRef('DEP');
  db.prepare('INSERT INTO deposits (user_id, amount_kobo, reference, note) VALUES (?, ?, ?, ?)').run(req.user.id, amount, reference, note);
  audit(req.user.id, 'deposit_request', reference, { amount }, ipOf(req));
  const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1').all();
  for (const a of admins) notify(a.id, 'Deposit pending', `${req.user.username} ${formatNGN(amount)} · ${reference}`, 'admin');
  res.status(201).json({
    reference,
    amount_kobo: amount,
    message: 'Transfer the exact amount to the displayed account. Use this reference as narration. An admin will credit you after confirmation.',
  });
});

app.post('/api/wallet/withdraw', auth, moneyLimiter, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (u.withdraw_blocked_until && new Date(u.withdraw_blocked_until + 'Z') > new Date()) {
    return res.status(429).json({ error: 'Withdrawal paused. Please wait at least 1 hour and try again.' });
  }
  const pending = db.prepare("SELECT COUNT(*) AS c FROM withdrawals WHERE status IN ('pending','processing')").get().c;
  if (pending >= MAX_PENDING_WITHDRAWALS) {
    const until = new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE users SET withdraw_blocked_until = ? WHERE id = ?').run(until, u.id);
    return res.status(429).json({
      error: 'Withdrawal queue is full (50 requests). Please wait at least 1 hour, then try again. Transfers are being processed.',
      retry_hours: 1,
    });
  }
  let amount;
  try { amount = nairaToKobo(req.body.amount); } catch { return res.status(400).json({ error: 'Invalid amount' }); }
  if (amount < MIN_WITHDRAW_KOBO) return res.status(400).json({ error: 'Minimum withdrawal is ₦100' });
  const bank_name = String(req.body.bank_name || '').trim();
  const account_number = String(req.body.account_number || '').replace(/\s+/g, '');
  const account_name = String(req.body.account_name || '').trim();
  if (bank_name.length < 2 || bank_name.length > 60) return res.status(400).json({ error: 'Enter a valid bank name' });
  if (!/^\d{8,16}$/.test(account_number)) return res.status(400).json({ error: 'Account number must be 8–16 digits' });
  if (account_name.length < 2 || account_name.length > 80) return res.status(400).json({ error: 'Enter the account name' });

  try {
    const tx = db.transaction(() => {
      applyLedger(db, {
        userId: u.id,
        amountKobo: -amount,
        type: 'withdraw_hold',
        ref: newRef('WTH'),
        meta: { bank_name, account_number, account_name },
        ip: ipOf(req),
      });
      const info = db.prepare(
        `INSERT INTO withdrawals (user_id, amount_kobo, bank_name, account_number, account_name, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      ).run(u.id, amount, bank_name, account_number, account_name);
      return Number(info.lastInsertRowid);
    });
    const id = tx();
    audit(u.id, 'withdraw_request', String(id), { amount }, ipOf(req));
    const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1').all();
    for (const a of admins) notify(a.id, 'Withdrawal request', `${u.username} ${formatNGN(amount)}`, 'admin');
    const fresh = db.prepare('SELECT balance_kobo FROM users WHERE id = ?').get(u.id);
    res.status(201).json({ id, balance_kobo: fresh.balance_kobo, message: 'Request queued. Funds are on hold until paid.' });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Cannot withdraw' });
  }
});

app.get('/api/notifications', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40').all(req.user.id);
  res.json(rows);
});
app.post('/api/notifications/read', auth, (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
  res.json({ ok: true });
});

/* ---------------- games ---------------- */
app.post('/api/practice', auth, (req, res) => {
  const g = createLiveGame({
    type: 'practice',
    hostId: req.user.id,
    betKobo: 0,
    playerInfos: [
      { userId: req.user.id, username: req.user.username, country: req.user.country },
      { userId: -1, username: 'WhotBot', country: 'NG', isBot: true },
    ],
  });
  afterMove(g);
  res.status(201).json({ gameId: g.id });
});

app.post('/api/versus/challenge', auth, moneyLimiter, (req, res) => {
  const toName = String(req.body.username || '').trim();
  let betKobo;
  try { betKobo = assertBet(req.body.amount); } catch (e) { return res.status(400).json({ error: e.message }); }
  const target = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_banned = 0').get(toName);
  if (!target) return res.status(404).json({ error: 'No player with that username' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot challenge yourself' });
  if (target.is_admin) return res.status(400).json({ error: 'That account is not a player' });
  const me = db.prepare('SELECT balance_kobo FROM users WHERE id = ?').get(req.user.id);
  if (me.balance_kobo < betKobo) return res.status(400).json({ error: 'Insufficient balance' });
  if (target.balance_kobo < betKobo) return res.status(400).json({ error: `${target.username} does not have enough balance for this stake` });

  const expires = new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const info = db.prepare(
    `INSERT INTO challenges (from_user, to_user, bet_kobo, kind, status, expires_at)
     VALUES (?, ?, ?, 'versus', 'pending', ?)`
  ).run(req.user.id, target.id, betKobo, expires);
  const ch = {
    id: Number(info.lastInsertRowid),
    from: req.user.username,
    fromId: req.user.id,
    to: target.username,
    bet_kobo: betKobo,
    amount: formatNGN(betKobo),
  };
  notify(target.id, 'Versus challenge', `${req.user.username} staked ${formatNGN(betKobo)}. Accept to lock funds and play.`, 'challenge');
  emitToUser(target.id, 'challenge', ch);
  audit(req.user.id, 'challenge', String(ch.id), { to: target.id, betKobo }, ipOf(req));
  res.status(201).json(ch);
});

app.get('/api/versus/inbox', auth, (req, res) => {
  const rows = db.prepare(
    `SELECT c.*, fu.username AS from_username, tu.username AS to_username
     FROM challenges c
     JOIN users fu ON fu.id = c.from_user
     JOIN users tu ON tu.id = c.to_user
     WHERE (c.from_user = ? OR c.to_user = ?) AND c.status = 'pending' AND c.expires_at > datetime('now')
     ORDER BY c.id DESC`
  ).all(req.user.id, req.user.id);
  res.json(rows);
});

function acceptChallenge(ch, actor) {
  if (ch.status !== 'pending') throw Object.assign(new Error('Challenge is no longer open'), { status: 400 });
  if (new Date(ch.expires_at + 'Z') < new Date()) {
    db.prepare("UPDATE challenges SET status = 'expired' WHERE id = ?").run(ch.id);
    throw Object.assign(new Error('Challenge expired'), { status: 400 });
  }
  const a = db.prepare('SELECT * FROM users WHERE id = ?').get(ch.from_user);
  const b = db.prepare('SELECT * FROM users WHERE id = ?').get(ch.to_user);
  if (!a || !b || a.is_banned || b.is_banned) throw Object.assign(new Error('A player is unavailable'), { status: 400 });
  if (a.balance_kobo < ch.bet_kobo || b.balance_kobo < ch.bet_kobo) {
    throw Object.assign(new Error('A player no longer has the stake'), { status: 400 });
  }

  const g = createLiveGame({
    type: ch.kind === 'tournament' ? 'tournament' : 'versus',
    hostId: ch.from_user,
    betKobo: ch.bet_kobo,
    playerInfos: [
      { userId: a.id, username: a.username, country: a.country },
      { userId: b.id, username: b.username, country: b.country },
    ],
  });
  try {
    lockStakes([a.id, b.id], ch.bet_kobo, g.id);
  } catch (e) {
    liveGames.delete(g.id);
    db.prepare('DELETE FROM game_players WHERE game_id = ?').run(g.id);
    db.prepare('DELETE FROM games WHERE id = ?').run(g.id);
    throw e;
  }
  db.prepare("UPDATE challenges SET status = 'accepted', game_id = ? WHERE id = ?").run(g.id, ch.id);
  emitToUser(a.id, 'wallet', { balance_kobo: db.prepare('SELECT balance_kobo FROM users WHERE id=?').get(a.id).balance_kobo });
  emitToUser(b.id, 'wallet', { balance_kobo: db.prepare('SELECT balance_kobo FROM users WHERE id=?').get(b.id).balance_kobo });
  afterMove(g);
  return g;
}

app.post('/api/versus/:id/accept', auth, moneyLimiter, (req, res) => {
  const ch = db.prepare('SELECT * FROM challenges WHERE id = ?').get(Number(req.params.id));
  if (!ch) return res.status(404).json({ error: 'Challenge not found' });
  if (ch.to_user !== req.user.id) return res.status(403).json({ error: 'This challenge is not for you' });
  try {
    const g = acceptChallenge(ch, req.user);
    res.json({ gameId: g.id });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.post('/api/versus/:id/decline', auth, (req, res) => {
  const ch = db.prepare('SELECT * FROM challenges WHERE id = ?').get(Number(req.params.id));
  if (!ch || ch.to_user !== req.user.id) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE challenges SET status = 'declined' WHERE id = ? AND status = 'pending'").run(ch.id);
  emitToUser(ch.from_user, 'toast', { kind: 'info', text: `${req.user.username} declined the challenge.` });
  res.json({ ok: true });
});

app.post('/api/tournament', auth, moneyLimiter, (req, res) => {
  const names = Array.isArray(req.body.usernames) ? req.body.usernames : [];
  let betKobo;
  try { betKobo = assertBet(req.body.amount); } catch (e) { return res.status(400).json({ error: e.message }); }
  const unique = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
  if (unique.length > 9) return res.status(400).json({ error: 'Max 10 players including you' });
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (me.balance_kobo < betKobo) return res.status(400).json({ error: 'Insufficient balance' });

  const players = [me];
  for (const name of unique) {
    if (name.toLowerCase() === me.username.toLowerCase()) continue;
    const u = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_banned = 0 AND is_admin = 0').get(name);
    if (!u) return res.status(404).json({ error: `No player named ${name}` });
    if (u.balance_kobo < betKobo) return res.status(400).json({ error: `${u.username} cannot cover ₦${betKobo / 100}` });
    players.push(u);
  }
  if (players.length > 10) return res.status(400).json({ error: 'Max 10 players' });
  if (players.length < 2) return res.status(400).json({ error: 'Add at least one other username' });

  const expires = new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const tourneyId = Number(db.prepare(
    `INSERT INTO games (type, status, bet_kobo, host_id, pot_kobo, state_json) VALUES ('tournament', 'lobby', ?, ?, 0, '{}')`
  ).run(betKobo, me.id).lastInsertRowid);

  db.prepare('INSERT INTO game_players (game_id, user_id, seat, result) VALUES (?, ?, 0, \'host\')').run(tourneyId, me.id);

  const invites = [];
  for (const p of players) {
    if (p.id === me.id) continue;
    const info = db.prepare(
      `INSERT INTO challenges (from_user, to_user, bet_kobo, kind, tournament_id, status, expires_at)
       VALUES (?, ?, ?, 'tournament', ?, 'pending', ?)`
    ).run(me.id, p.id, betKobo, tourneyId, expires);
    invites.push(Number(info.lastInsertRowid));
    notify(p.id, 'Tournament invite', `${me.username} invited you · stake ${formatNGN(betKobo)}`, 'challenge');
    emitToUser(p.id, 'tournament_invite', {
      id: Number(info.lastInsertRowid),
      tournament_id: tourneyId,
      from: me.username,
      amount: formatNGN(betKobo),
      bet_kobo: betKobo,
    });
  }
  res.status(201).json({ tournamentId: tourneyId, invites: invites.length, players: players.map((p) => p.username) });
});

app.post('/api/tournament/:id/accept', auth, moneyLimiter, (req, res) => {
  const ch = db.prepare("SELECT * FROM challenges WHERE tournament_id = ? AND to_user = ? AND kind = 'tournament' AND status = 'pending'")
    .get(Number(req.params.id), req.user.id);
  if (!ch) return res.status(404).json({ error: 'Invite not found' });
  db.prepare("UPDATE challenges SET status = 'accepted' WHERE id = ?").run(ch.id);
  const seats = db.prepare('SELECT COUNT(*) AS c FROM game_players WHERE game_id = ?').get(ch.tournament_id).c;
  db.prepare('INSERT OR IGNORE INTO game_players (game_id, user_id, seat, result) VALUES (?, ?, ?, \'accepted\')')
    .run(ch.tournament_id, req.user.id, seats);
  emitToUser(ch.from_user, 'toast', { kind: 'info', text: `${req.user.username} joined the tournament.` });
  res.json({ ok: true });
});

app.post('/api/tournament/:id/start', auth, moneyLimiter, (req, res) => {
  const t = db.prepare("SELECT * FROM games WHERE id = ? AND type = 'tournament'").get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.host_id !== req.user.id) return res.status(403).json({ error: 'Only the host can start' });
  if (t.status !== 'lobby') return res.status(400).json({ error: 'Already started' });
  const gps = db.prepare(
    `SELECT gp.user_id, u.username, u.country, u.balance_kobo
     FROM game_players gp JOIN users u ON u.id = gp.user_id WHERE gp.game_id = ?`
  ).all(t.id);
  if (gps.length < 2) return res.status(400).json({ error: 'Need at least 2 accepted players' });
  if (gps.length > 10) return res.status(400).json({ error: 'Max 10 players' });
  for (const p of gps) {
    if (p.balance_kobo < t.bet_kobo) return res.status(400).json({ error: `${p.username} cannot cover the stake` });
  }
  const playerInfos = gps.map((p) => ({ userId: p.user_id, username: p.username, country: p.country }));
  const g = new WhotGame({ id: t.id, type: 'tournament', playerInfos, betKobo: t.bet_kobo });
  try {
    lockStakes(gps.map((p) => p.user_id), t.bet_kobo, t.id);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  db.prepare("UPDATE games SET status = 'playing', pot_kobo = ?, state_json = ? WHERE id = ?")
    .run(t.bet_kobo * gps.length, g.serialize(), t.id);
  liveGames.set(t.id, g);
  for (const p of gps) {
    const bal = db.prepare('SELECT balance_kobo FROM users WHERE id = ?').get(p.user_id);
    emitToUser(p.user_id, 'wallet', { balance_kobo: bal.balance_kobo });
  }
  afterMove(g);
  res.json({ gameId: g.id });
});

app.get('/api/games/active', auth, (req, res) => {
  const rows = db.prepare(
    `SELECT g.* FROM games g
     JOIN game_players gp ON gp.game_id = g.id
     WHERE gp.user_id = ? AND g.status IN ('playing','lobby')
     ORDER BY g.id DESC LIMIT 10`
  ).all(req.user.id);
  res.json(rows.map((r) => ({ id: r.id, type: r.type, status: r.status, bet_kobo: r.bet_kobo })));
});

app.get('/api/games/:id', auth, (req, res) => {
  const g = liveGames.get(Number(req.params.id));
  if (g) {
    if (!g.player(req.user.id) && !req.user.is_admin) return res.status(403).json({ error: 'Not at this table' });
    return res.json(g.publicState(req.user.id));
  }
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Game not found' });
  if (row.state_json) {
    try {
      const restored = WhotGame.deserialize(row.state_json);
      return res.json(restored.publicState(req.user.id));
    } catch { /* fallthrough */ }
  }
  res.json({ id: row.id, status: row.status, winnerId: row.winner_id });
});

app.get('/api/games/:id/chat', auth, (req, res) => {
  const rows = db.prepare(
    `SELECT m.id, m.body, m.created_at, u.username FROM messages m JOIN users u ON u.id = m.user_id
     WHERE m.game_id = ? ORDER BY m.id DESC LIMIT 50`
  ).all(Number(req.params.id));
  res.json(rows.reverse());
});

/* ---------------- admin ---------------- */
app.get('/api/admin/dashboard', auth, adminOnly, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 0').get().c;
  const liability = db.prepare('SELECT COALESCE(SUM(balance_kobo),0) AS s FROM users WHERE is_admin = 0').get().s;
  const house = db.prepare('SELECT balance_kobo FROM house_wallet WHERE id = 1').get().balance_kobo;
  const pendingDep = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(amount_kobo),0) AS s FROM deposits WHERE status = 'pending'").get();
  const pendingW = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(amount_kobo),0) AS s FROM withdrawals WHERE status IN ('pending','processing')").get();
  const approvedDep = db.prepare("SELECT COALESCE(SUM(amount_kobo),0) AS s FROM deposits WHERE status = 'approved'").get().s;
  const paidW = db.prepare("SELECT COALESCE(SUM(amount_kobo),0) AS s FROM withdrawals WHERE status = 'paid'").get().s;
  const rec = reconcile();
  res.json({
    users,
    liability,
    house,
    pending_deposits: pendingDep,
    pending_withdrawals: pendingW,
    approved_deposits: approvedDep,
    paid_withdrawals: paidW,
    bank_should_hold: liability,
    settings: getSettings(),
    reconcile: rec,
    format: {
      liability: formatNGN(liability),
      house: formatNGN(house),
    },
  });
});

app.put('/api/admin/bank', auth, adminOnly, (req, res) => {
  const allow = [
    'deposit_bank_name', 'deposit_account_number', 'deposit_account_name',
    'rake_bank_name', 'rake_account_number', 'rake_account_name',
  ];
  for (const k of allow) {
    if (req.body[k] != null) setSetting(k, String(req.body[k]).slice(0, 80));
  }
  audit(req.user.id, 'bank_update', null, req.body, ipOf(req));
  res.json(getSettings());
});

app.get('/api/admin/deposits', auth, adminOnly, (req, res) => {
  const status = req.query.status || 'pending';
  const rows = db.prepare(
    `SELECT d.*, u.username, u.country FROM deposits d JOIN users u ON u.id = d.user_id
     WHERE d.status = ? ORDER BY d.id ASC LIMIT 100`
  ).all(status);
  res.json(rows);
});

app.post('/api/admin/deposits/:id/approve', auth, adminOnly, (req, res) => {
  const d = db.prepare('SELECT * FROM deposits WHERE id = ?').get(Number(req.params.id));
  if (!d || d.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  const tx = db.transaction(() => {
    db.prepare("UPDATE deposits SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ? AND status = 'pending'")
      .run(req.user.id, d.id);
    applyLedger(db, {
      userId: d.user_id,
      amountKobo: d.amount_kobo,
      type: 'deposit',
      ref: d.reference,
      createdBy: req.user.id,
      ip: ipOf(req),
    });
  });
  tx();
  const u = db.prepare('SELECT username, balance_kobo FROM users WHERE id = ?').get(d.user_id);
  notify(d.user_id, 'Deposit credited', `${formatNGN(d.amount_kobo)} is now in your wallet.`, 'money');
  emitToUser(d.user_id, 'wallet', { balance_kobo: u.balance_kobo });
  emitToUser(d.user_id, 'toast', { kind: 'win', text: `Deposit ${formatNGN(d.amount_kobo)} credited` });
  audit(req.user.id, 'deposit_approve', String(d.id), { amount: d.amount_kobo, user: d.user_id }, ipOf(req));
  res.json({ ok: true });
});

app.post('/api/admin/deposits/:id/reject', auth, adminOnly, (req, res) => {
  const d = db.prepare('SELECT * FROM deposits WHERE id = ?').get(Number(req.params.id));
  if (!d || d.status !== 'pending') return res.status(400).json({ error: 'Not pending' });
  db.prepare("UPDATE deposits SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?").run(req.user.id, d.id);
  notify(d.user_id, 'Deposit rejected', `Reference ${d.reference} was not credited.`, 'info');
  audit(req.user.id, 'deposit_reject', String(d.id), null, ipOf(req));
  res.json({ ok: true });
});

app.get('/api/admin/withdrawals', auth, adminOnly, (req, res) => {
  const status = req.query.status || 'pending';
  const rows = db.prepare(
    `SELECT w.*, u.username, u.country FROM withdrawals w JOIN users u ON u.id = w.user_id
     WHERE w.status = ? ORDER BY w.id ASC LIMIT 100`
  ).all(status);
  res.json(rows);
});

app.post('/api/admin/withdrawals/:id/paid', auth, adminOnly, (req, res) => {
  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(Number(req.params.id));
  if (!w || !['pending', 'processing'].includes(w.status)) return res.status(400).json({ error: 'Not pending' });
  db.prepare("UPDATE withdrawals SET status = 'paid', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?")
    .run(req.user.id, w.id);
  db.prepare("INSERT INTO ledger (user_id, amount_kobo, type, ref, meta, created_by) VALUES (?, 0, 'withdraw_paid', ?, ?, ?)")
    .run(w.user_id, newRef('PAID'), JSON.stringify({ withdrawalId: w.id, amount: w.amount_kobo }), req.user.id);
  notify(w.user_id, 'Withdrawal sent', `${formatNGN(w.amount_kobo)} marked as paid.`, 'money');
  emitToUser(w.user_id, 'toast', { kind: 'info', text: 'Your withdrawal was sent.' });
  audit(req.user.id, 'withdraw_paid', String(w.id), { amount: w.amount_kobo }, ipOf(req));
  res.json({ ok: true });
});

app.post('/api/admin/withdrawals/:id/reject', auth, adminOnly, (req, res) => {
  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(Number(req.params.id));
  if (!w || !['pending', 'processing'].includes(w.status)) return res.status(400).json({ error: 'Not pending' });
  const tx = db.transaction(() => {
    db.prepare("UPDATE withdrawals SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ?, admin_note = ? WHERE id = ?")
      .run(req.user.id, String(req.body.note || '').slice(0, 160), w.id);
    applyLedger(db, {
      userId: w.user_id,
      amountKobo: w.amount_kobo,
      type: 'withdraw_reject',
      ref: newRef('WRJ'),
      createdBy: req.user.id,
      meta: { withdrawalId: w.id },
    });
  });
  tx();
  const u = db.prepare('SELECT balance_kobo FROM users WHERE id = ?').get(w.user_id);
  notify(w.user_id, 'Withdrawal returned', `${formatNGN(w.amount_kobo)} returned to your wallet.`, 'money');
  emitToUser(w.user_id, 'wallet', { balance_kobo: u.balance_kobo });
  audit(req.user.id, 'withdraw_reject', String(w.id), null, ipOf(req));
  res.json({ ok: true });
});

app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const q = String(req.query.q || '').replace(/[%_]/g, '');
  const rows = q
    ? db.prepare(`SELECT id, username, country, balance_kobo, is_banned, created_at, last_login FROM users WHERE is_admin = 0 AND username LIKE ? LIMIT 50`).all(`%${q}%`)
    : db.prepare(`SELECT id, username, country, balance_kobo, is_banned, created_at, last_login FROM users WHERE is_admin = 0 ORDER BY id DESC LIMIT 50`).all();
  res.json(rows);
});

app.post('/api/admin/users/:id/ban', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot ban yourself' });
  const ban = req.body.ban ? 1 : 0;
  db.prepare('UPDATE users SET is_banned = ?, token_version = token_version + 1 WHERE id = ? AND is_admin = 0').run(ban, id);
  audit(req.user.id, ban ? 'ban' : 'unban', String(id), null, ipOf(req));
  res.json({ ok: true });
});

app.get('/api/admin/audit', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 80').all();
  res.json(rows);
});

app.get('/api/admin/ledger', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM ledger ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

app.post('/api/admin/reconcile', auth, adminOnly, (req, res) => {
  res.json(reconcile());
});

app.post('/api/admin/password', auth, adminOnly, (req, res) => {
  const { current, next } = req.body || {};
  if (!validPassword(next)) return res.status(400).json({ error: 'Weak password' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(current || ''), user.password_hash)) return res.status(400).json({ error: 'Current password is wrong' });
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(bcrypt.hashSync(next, 12), user.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ token: signToken(fresh), ok: true });
});

/* ---------------- sockets ---------------- */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || '';
  try {
    const p = jwt.verify(token, JWT_SECRET, { issuer: '9jawhot' });
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_banned = 0').get(p.uid);
    if (!user || (user.token_version || 0) !== p.v) return next(new Error('auth'));
    socket.user = user;
    next();
  } catch {
    next(new Error('auth'));
  }
});

io.on('connection', (socket) => {
  const uid = socket.user.id;
  socket.join(`user:${uid}`);
  if (!online.has(uid)) online.set(uid, new Set());
  online.get(uid).add(socket.id);
  io.emit('presence', { userId: uid, online: true });

  socket.on('join_game', (gameId) => {
    const g = liveGames.get(Number(gameId));
    if (!g || !g.player(uid)) return;
    socket.join(`game:${g.id}`);
    const p = g.player(uid);
    p.connected = true;
    socket.emit('game_state', g.publicState(uid));
  });

  socket.on('play_card', (payload) => {
    const g = liveGames.get(Number(payload?.gameId));
    if (!g) return socket.emit('error_msg', 'Table not found');
    try {
      g.playCard(uid, payload.cardId, { calledSuit: payload.calledSuit, declareLast: !!payload.declareLast });
      afterMove(g);
    } catch (e) {
      socket.emit('error_msg', e.message);
    }
  });

  socket.on('draw_market', (payload) => {
    const g = liveGames.get(Number(payload?.gameId));
    if (!g) return socket.emit('error_msg', 'Table not found');
    try {
      g.drawMarket(uid);
      afterMove(g);
    } catch (e) {
      socket.emit('error_msg', e.message);
    }
  });

  socket.on('last_card', (payload) => {
    const g = liveGames.get(Number(payload?.gameId));
    if (!g) return;
    try {
      const r = g.sayLastCard(uid);
      persistGame(g);
      io.to(`game:${g.id}`).emit('game_event', r.events[0]);
      broadcastGame(g);
    } catch (e) {
      socket.emit('error_msg', e.message);
    }
  });

  socket.on('chat', (payload) => {
    const gameId = Number(payload?.gameId);
    const body = String(payload?.body || '').replace(/[\u0000-\u001F<>]/g, '').trim().slice(0, 240);
    if (!body) return;
    const g = liveGames.get(gameId);
    const inGame = g && g.player(uid);
    const gp = db.prepare('SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?').get(gameId, uid);
    if (!inGame && !gp) return;
    db.prepare('INSERT INTO messages (game_id, user_id, body) VALUES (?, ?, ?)').run(gameId, uid, body);
    const msg = { username: socket.user.username, body, created_at: new Date().toISOString() };
    io.to(`game:${gameId}`).emit('chat', msg);
    if (g) {
      for (const p of g.players) if (p.userId > 0) emitToUser(p.userId, 'chat', { ...msg, gameId });
    }
  });

  socket.on('disconnect', () => {
    const set = online.get(uid);
    if (set) {
      set.delete(socket.id);
      if (!set.size) {
        online.delete(uid);
        io.emit('presence', { userId: uid, online: false });
      }
    }
  });
});

setInterval(() => {
  for (const g of liveGames.values()) {
    if (g.status !== 'playing') continue;
    if (g.current?.isBot) continue;
    if (Date.now() - g.turnStartedAt > TURN_MS) {
      g.timeoutDraw();
      afterMove(g);
    }
  }
}, 1000);

try {
  const rows = db.prepare("SELECT * FROM games WHERE status = 'playing'").all();
  for (const r of rows) {
    if (!r.state_json) continue;
    try {
      const g = WhotGame.deserialize(r.state_json);
      liveGames.set(g.id, g);
    } catch { /* skip corrupt */ }
  }
} catch { /* first boot */ }

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`9jaWhot table live on 0.0.0.0:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('Default admin: admin / ChangeMe_9jaWhot!  — change this immediately.');
  }
});
