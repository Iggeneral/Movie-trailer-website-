import { api, ngn, FLAG } from './api.js';
import { audio } from './audio.js';
import { renderCard, renderCardBack, suitLabel, pipSvg, SUIT_META } from './cards.js';
import { TERMS_HTML } from './terms.js';

const app = document.getElementById('app');
const fx = document.getElementById('fx');
const ctx = fx.getContext('2d');

const S = {
  view: 'splash',
  user: null,
  countries: [],
  wallet: null,
  inbox: [],
  game: null,
  chat: [],
  chatOpen: false,
  pendingWhot: null,
  socket: null,
  toasts: [],
  tab: 'login',
  callout: '',
};

function toast(text, kind = 'info') {
  S.toasts.push({ text, kind, id: Date.now() });
  render();
  setTimeout(() => { S.toasts.shift(); render(); }, 3200);
}

async function boot() {
  resizeFx();
  loopFx();
  try { S.countries = await api.req('/api/countries'); } catch { S.countries = [{ code: 'NG', name: 'Nigeria' }]; }
  if (api.token) {
    try {
      const me = await api.req('/api/me');
      S.user = me.user;
      if (S.user.is_admin) { window.location.replace('/admin'); return; }
      audio.setVoice(S.user.voice_on);
      audio.setMusic(S.user.music_on);
      connectSocket();
      S.view = 'lobby';
    } catch {
      api.setToken('');
    }
  }
  render();
}

function connectSocket() {
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  S.socket = io({ auth: { token: api.token } });
  S.socket.on('game_state', (st) => {
    const prev = S.game?.turnSeq;
    S.game = st;
    if (st.lastEvents?.length && st.turnSeq !== prev) {
      for (const ev of st.lastEvents) {
        if (ev.voice && ev.voice !== 'whot' && ev.voice !== 'welcome') {
          if (ev.voice.startsWith('need_') && S.skipNeedVoice) S.skipNeedVoice = false;
          else audio.playVoice(ev.voice, ev.text);
        }
        if (ev.text) S.callout = ev.calledSuit ? `I need ${suitLabel(ev.calledSuit)}` : ev.text;
      }
      if (st.status === 'finished') {
        const win = st.winnerId === S.user.id;
        audio.playVoice(win ? 'you_win' : 'you_lose');
        burst(win);
      }
    }
    if (S.view === 'table' || st.status === 'playing' || st.status === 'finished') {
      S.view = 'table';
      S.socket.emit('join_game', st.id);
    }
    render();
  });
  S.socket.on('challenge', (ch) => {
    toast(`${ch.from} challenged you for ${ch.amount}`);
    S.inbox.unshift(ch);
    render();
  });
  S.socket.on('tournament_invite', (inv) => {
    toast(`${inv.from} invited you to a tournament · ${inv.amount}`);
    S.inbox.unshift({
      id: inv.id,
      from: inv.from,
      from_username: inv.from,
      bet_kobo: inv.bet_kobo,
      amount: inv.amount,
      kind: 'tournament',
      tournament_id: inv.tournament_id,
    });
    render();
  });
  S.socket.on('wallet', (w) => {
    if (S.user) S.user.balance_kobo = w.balance_kobo;
    if (S.wallet) S.wallet.balance_kobo = w.balance_kobo;
    render();
  });
  S.socket.on('toast', (t) => toast(t.text, t.kind));
  S.socket.on('chat', (m) => {
    S.chat.push(m);
    if (S.chat.length > 80) S.chat.shift();
    render();
  });
  S.socket.on('error_msg', (m) => toast(m, 'bad'));
  S.socket.on('connect_error', () => { /* silent */ });
}

function icon(name) {
  const p = {
    home: 'M4 12 L12 4 L20 12 V20 H4 Z',
    vs: 'M5 5 L19 19 M19 5 L5 19',
    cup: 'M8 5 H16 V9 A4 4 0 0 1 8 9 Z M10 13 H14 V19 H10 Z',
    wallet: 'M4 7 H20 V19 H4 Z M16 12 H20',
    gear: 'M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${name === 'home' ? `<path d="${p.home}"/>` : `<path d="${p[name] || p.home}"/>`}</svg>`;
}

function shell(inner, nav) {
  const bal = S.user ? ngn(S.user.balance_kobo) : '₦0.00';
  return `
    <div class="shell">
      <div class="topbar">
        <div class="brand-mini"><img src="/icons/logo.png" alt=""/>9ja<span style="color:var(--gold)">Whot</span></div>
        <button class="pill" data-go="wallet">${bal}</button>
      </div>
      <div class="scroll">${inner}</div>
      <nav class="nav">
        <button data-go="lobby" class="${nav==='lobby'?'on':''}">${icon('home')}Home</button>
        <button data-go="versus" class="${nav==='versus'?'on':''}">${icon('vs')}Versus</button>
        <button data-go="tournament" class="${nav==='tournament'?'on':''}">${icon('cup')}Tourneys</button>
        <button data-go="wallet" class="${nav==='wallet'?'on':''}">${icon('wallet')}Wallet</button>
        <button data-go="settings" class="${nav==='settings'?'on':''}">${icon('gear')}Settings</button>
      </nav>
    </div>`;
}

function viewSplash() {
  return `
    <div class="splash">
      <div>
        <div class="orbit">
          <div class="mini-card">●</div>
          <div class="mini-card">▲</div>
          <div class="mini-card">■</div>
          <div class="mini-card">✚</div>
          <img class="logo" src="/icons/logo.png" alt="9jaWhot"/>
        </div>
        <div class="brand">9ja<span>Whot</span></div>
        <p class="tag">Nigeria’s sharpest table. Match shape or number. Call your move.</p>
        <button class="btn btn-gold" id="enter">Enter the table</button>
        <p class="age-note">18+ only. Real-money stakes. Play responsibly.</p>
      </div>
    </div>`;
}

function viewAuth() {
  const opts = S.countries.map((c) => `<option value="${c.code}" ${c.code==='NG'?'selected':''}>${c.name}</option>`).join('');
  return `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="brand-mini" style="justify-content:center;margin-bottom:8px"><img src="/icons/logo.png"/>9jaWhot</div>
        <div class="tabs">
          <button data-tab="login" class="${S.tab==='login'?'on':''}">Sign in</button>
          <button data-tab="register" class="${S.tab==='register'?'on':''}">Create account</button>
        </div>
        <form class="panel stack" id="auth-form">
          <label class="field"><span>Username</span><input name="username" autocomplete="username" required maxlength="20"/></label>
          <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${S.tab==='login'?'current-password':'new-password'}" required/></label>
          ${S.tab==='register' ? `
            <label class="field"><span>Country</span><select name="country">${opts}</select></label>
            <label class="field"><span>Email (optional)</span><input name="email" type="email"/></label>
            <label class="check"><input type="checkbox" name="age18"/> I am 18 or older.</label>
            <label class="check"><input type="checkbox" name="terms"/> I accept the Terms. A 5% commission applies on paid matches.</label>
            <button type="button" class="btn btn-ghost btn-block" data-go="terms">Terms</button>
          ` : ''}
          <button class="btn btn-gold btn-block" type="submit">${S.tab==='login'?'Enter':'Join the table'}</button>
        </form>
      </div>
    </div>`;
}

function viewLobby() {
  const u = S.user;
  return shell(`
    <p class="muted">${FLAG(u.country)} Welcome, <b style="color:#fff">${u.username}</b></p>
    <h2 style="margin-top:8px">The market is open.</h2>
    <div class="hero-modes">
      <button class="mode-card" data-go="versus"><i>⚔</i><b>Versus</b><span>Challenge any username. 5% commission.</span></button>
      <button class="mode-card gold" data-go="tournament"><i>♛</i><b>Tournament</b><span>Host up to 10 players. 5% commission.</span></button>
      <button class="mode-card white" id="practice"><i>♣</i><b>Practice</b><span>Free table against WhotBot.</span></button>
    </div>
    <p style="margin-top:14px"><button class="btn btn-ghost" data-go="howto">How to play</button></p>
  `, 'lobby');
}

function viewVersus() {
  const inbox = (S.inbox || []).map((c) => `
    <div class="row">
      <div><b>${c.from || c.from_username}</b><div class="muted">${c.amount || ngn(c.bet_kobo)}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-green" data-acc="${c.id}">Accept</button>
        <button class="btn btn-ghost" data-dec="${c.id}">No</button>
      </div>
    </div>`).join('') || `<p class="muted">No open challenges.</p>`;
  return shell(`
    <h2>Versus</h2>
    <p class="muted">Enter a username and stake. 5% commission on paid matches.</p>
    <form class="panel stack" id="challenge-form" style="margin:12px 0">
      <label class="field"><span>Their username</span><input name="username" required placeholder="e.g. amaka_lagos"/></label>
      <label class="field"><span>Stake (₦)</span><input name="amount" type="number" min="100" step="1" value="1000" required/></label>
      <button class="btn btn-gold" type="submit">Send challenge</button>
    </form>
    <h2 style="font-size:16px">Incoming</h2>
    <div class="list">${inbox}</div>
  `, 'versus');
}

function viewTournament() {
  return shell(`
    <h2>Tournament</h2>
    <p class="muted">Invite up to 9 other usernames. 5% commission. Max 10 at the table.</p>
    <form class="panel stack" id="tourney-form" style="margin:12px 0">
      <label class="field"><span>Buy-in (₦)</span><input name="amount" type="number" min="100" value="1000" required/></label>
      <label class="field"><span>Usernames (comma separated, max 9)</span>
        <textarea name="usernames" rows="3" placeholder="chidi, amaka, kola, zainab"></textarea>
      </label>
      <button class="btn btn-gold" type="submit">Send invites</button>
    </form>
    ${S.hostTourney ? `<div class="panel"><p>Tournament #${S.hostTourney} is in lobby.</p><button class="btn btn-gold" id="start-t" data-tid="${S.hostTourney}">Start table</button></div>` : ''}
  `, 'tournament');
}

function viewWallet() {
  const w = S.wallet;
  if (!w) return shell('<p class="muted">Loading wallet…</p>', 'wallet');
  const bank = w.deposit_bank || {};
  const led = (w.ledger || []).slice(0, 12).map((l) => `
    <div class="row"><div><b>${l.type}</b><div class="muted">${l.ref}</div></div>
    <div style="color:${l.amount_kobo>=0?'#8ef0c4':'#ff9b9b'}">${l.amount_kobo>=0?'+':''}${ngn(l.amount_kobo)}</div></div>`).join('');
  const deps = (w.deposits || []).slice(0, 5).map((d) => `<div class="row"><div>${d.reference}</div><span class="badge">${d.status}</span></div>`).join('');
  const wds = (w.withdrawals || []).slice(0, 5).map((d) => `<div class="row"><div>${ngn(d.amount_kobo)}</div><span class="badge warn">${d.status}</span></div>`).join('');
  return shell(`
    <h2>${ngn(w.balance_kobo)}</h2>
    <p class="muted">Available balance · all moves settle on the server</p>
    <div class="grid-2" style="margin:12px 0">
      <button class="btn btn-gold" id="show-dep">Deposit</button>
      <button class="btn btn-ghost" id="show-wd">Withdraw</button>
    </div>
    <div class="panel" id="dep-box" hidden>
      <b>Bank transfer</b>
      <p class="muted">Send to this account, then log the amount. Use the reference as narration. Credit appears after the transfer is confirmed.</p>
      <div class="row" style="margin:8px 0"><span>Bank</span><b>${bank.bank_name || '—'}</b></div>
      <div class="row"><span>Account</span><b>${bank.account_number || '—'}</b></div>
      <div class="row"><span>Name</span><b>${bank.account_name || '—'}</b></div>
      <form id="dep-form" class="stack" style="margin-top:10px">
        <label class="field"><span>Amount (₦)</span><input name="amount" type="number" min="100" required/></label>
        <label class="field"><span>Narration / note</span><input name="note" maxlength="160" placeholder="Your bank reference"/></label>
        <button class="btn btn-green" type="submit">I have transferred</button>
      </form>
    </div>
    <div class="panel" id="wd-box" hidden style="margin-top:10px">
      <b>Withdraw</b>
      <p class="muted">Your request is queued and paid to the account you enter.</p>
      <form id="wd-form" class="stack" style="margin-top:10px">
        <label class="field"><span>Amount (₦)</span><input name="amount" type="number" min="100" required/></label>
        <label class="field"><span>Bank name</span><input name="bank_name" required/></label>
        <label class="field"><span>Account number</span><input name="account_number" inputmode="numeric" required/></label>
        <label class="field"><span>Account name</span><input name="account_name" required/></label>
        <button class="btn btn-gold" type="submit">Request withdrawal</button>
      </form>
    </div>
    <h2 style="font-size:16px;margin-top:16px">Ledger</h2>
    <div class="list">${led || '<p class="muted">No movements yet.</p>'}</div>
    <h2 style="font-size:16px;margin-top:16px">Deposits</h2>
    <div class="list">${deps || '<p class="muted">None</p>'}</div>
    <h2 style="font-size:16px;margin-top:16px">Withdrawals</h2>
    <div class="list">${wds || '<p class="muted">None</p>'}</div>
  `, 'wallet');
}

function viewSettings() {
  const u = S.user;
  return shell(`
    <h2>Settings</h2>
    <div class="panel">
      <label class="switch">Voice callouts <input type="checkbox" id="voice" ${u.voice_on?'checked':''}/></label>
      <label class="switch">Soft jazz <input type="checkbox" id="music" ${u.music_on?'checked':''}/></label>
    </div>
    <div class="panel" style="margin-top:12px">
      <p>${FLAG(u.country)} <b>${u.username}</b></p>
      <p class="muted">${u.email || 'No email'} · ${u.country}</p>
      <button class="btn btn-ghost btn-block" data-go="terms" style="margin-top:12px">Terms</button>
      <button class="btn btn-ghost" id="logout" style="margin-top:12px">Sign out</button>
    </div>
    <p class="muted" style="margin-top:16px">18+ · Play responsibly</p>
  `, 'settings');
}

function viewTerms() {
  const back = S.user ? 'settings' : 'auth';
  return `
    <div class="auth-wrap legal-view">
      <div class="auth-card">
        <div class="brand-mini" style="margin-bottom:12px"><img src="/icons/logo.png" alt=""/>Terms</div>
        ${TERMS_HTML}
        <button class="btn btn-gold btn-block" data-go="${back}" style="margin-top:16px">Back</button>
      </div>
    </div>`;
}

function viewHowto() {
  return shell(`
    <h2>How to play Whot</h2>
    <div class="panel howto">
      <ul>
        <li>Play a card that matches the <b>shape</b> or the <b>number</b> on the call card.</li>
        <li>If you cannot, go to <b>market</b> (draw one).</li>
        <li><b>1 — Hold on</b>: you play again.</li>
        <li><b>2 — Pick two</b>: next player picks 2 or defends with another 2 (stacks).</li>
        <li><b>5 — Pick three</b>: next picks 3 or defends with a 5.</li>
        <li><b>8 — Suspension</b>: next player is skipped.</li>
        <li><b>14 — General market</b>: everyone else picks one.</li>
        <li><b>WHOT (20)</b>: call the next shape. You cannot finish on WHOT.</li>
        <li>When you have two cards, tap <b>Last card</b> before playing down to one. Forget, and you pick two as penalty.</li>
        <li>Empty your hand first — that’s the table.</li>
      </ul>
    </div>
  `, 'lobby');
}

function positionOpponents(players, me) {
  const others = players.filter((p) => p.userId !== me);
  const n = others.length;
  return others.map((p, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const left = 8 + t * 84;
    const top = n === 1 ? 6 : 8 + Math.sin(t * Math.PI) * 4;
    return { p, left, top };
  });
}

function viewTable() {
  const g = S.game;
  if (!g) return '<div class="table-view"><p style="padding:20px">Waiting for the table…</p></div>';
  const mine = g.yourHand || [];
  const legalIds = new Set(
    mine.filter((c) => isLegalClient(c, g)).map((c) => c.id)
  );
  const opps = positionOpponents(g.players, S.user.id).map(({ p, left, top }) => `
    <div class="opp ${p.isTurn?'is-turn':''}" style="left:${left}%; top:${top}%; transform:translateX(-50%)">
      <div class="avatar">${FLAG(p.country)}</div>
      <div class="mini-stack" aria-hidden="true">${'<i></i>'.repeat(Math.min(p.cardCount, 4))}</div>
      <div class="name">${p.username}${p.saidLast ? ' · last' : ''}</div>
      <div class="count">${p.cardCount}</div>
    </div>`).join('');

  const chat = S.chat.map((m) => `<div><b>${m.username}:</b> ${escapeHtml(m.body)}</div>`).join('');
  const shapes = ['circle','triangle','cross','square','star'].map((s) => {
    const meta = SUIT_META[s];
    return `<button class="shape-btn" data-shape="${s}" style="--pip:${meta.color}">
      <span class="shape-pip">${pipSvg(s, 36)}</span>
      <span class="shape-name">${meta.label}</span>
    </button>`;
  }).join('');

  const finished = g.status === 'finished';
  const youWin = finished && g.winnerId === S.user.id;

  return `
    <div class="table-view">
      <div class="table-top">
        <button class="btn btn-ghost" data-go="lobby">Leave</button>
        <div class="turn-banner">${finished ? (youWin ? 'You win the table' : 'Hand is over') : (g.currentUserId === S.user.id ? 'Your turn' : `${g.currentUsername}'s turn`)}</div>
        <button class="btn btn-ghost" id="toggle-chat">Chat</button>
      </div>
      <div class="felt-wrap">
      <div class="felt">
        <div class="opponents">${opps}</div>
        ${S.callout ? `<div class="callout">${escapeHtml(S.callout)}</div>` : ''}
        <div class="call-stack">
          <div class="market-deck" id="market-pile"></div>
          <div id="call-card"></div>
        </div>
        ${g.calledSuit ? `<div class="need-flag">Need ${suitLabel(g.calledSuit)}</div>` : ''}
        ${g.pending ? `<div class="need-flag right">${g.pending.type.replace('_',' ')} × ${g.pending.stacks}</div>` : ''}
      </div>
      </div>
      <div class="hand-dock">
        <div class="actions">
          <button class="btn btn-gold" id="btn-market">Market</button>
          <button class="btn btn-ghost" id="btn-last">Last card</button>
        </div>
        <div class="hand" id="hand"></div>
      </div>
      <div class="chat-dock ${S.chatOpen?'open':''}">
        <div class="chat-log">${chat || '<div class="muted">Say something.</div>'}</div>
        <form id="chat-form"><input name="body" maxlength="240" placeholder="Message…"/><button class="btn btn-green" type="submit">Send</button></form>
      </div>
      ${S.pendingWhot ? `<div class="shape-pick">
        <div class="need-sheet">
          <p class="need-kicker">WHOT</p>
          <h2>I need…</h2>
          <p class="muted">Tap the shape the table must play. Voice calls it when you choose.</p>
          <div class="need-grid">${shapes}</div>
        </div>
      </div>` : ''}
      ${finished ? `<div class="modal-bg"><div class="panel" style="max-width:360px;text-align:center">
        <h2>${youWin ? 'You take the table' : 'Next hand, sharper'}</h2>
        <p class="muted">${youWin ? 'Winnings are already in your wallet.' : 'The stake has settled.'}</p>
        <button class="btn btn-gold" data-go="lobby" style="margin-top:12px">Back to lobby</button>
      </div></div>` : ''}
    </div>`;
}

function isLegalClient(card, g) {
  if (card.special === 'whot' && (g.yourHand || []).length === 1) return false;
  if (g.pending) {
    if (g.pending.type === 'pick_two') return card.rank === 2;
    if (g.pending.type === 'pick_three') return card.rank === 5;
    return false;
  }
  if (card.special === 'whot' || card.rank === 20) return true;
  const top = g.callCard;
  if (g.calledSuit) return card.suit === g.calledSuit;
  return card.suit === top.suit || card.rank === top.rank;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function render() {
  const map = {
    splash: viewSplash,
    auth: viewAuth,
    lobby: viewLobby,
    versus: viewVersus,
    tournament: viewTournament,
    wallet: viewWallet,
    settings: viewSettings,
    howto: viewHowto,
    terms: viewTerms,
    table: viewTable,
  };
  app.innerHTML = (map[S.view] || viewSplash)();
  const t = S.toasts[S.toasts.length - 1];
  if (t) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = t.text;
    app.appendChild(el);
  }
  hydrate();
}

function hydrate() {
  if (S.view === 'table' && S.game) {
    const call = document.getElementById('call-card');
    const pile = document.getElementById('market-pile');
    const hand = document.getElementById('hand');
    if (call && S.game.callCard) call.appendChild(renderCard(S.game.callCard, { compact: true }));
    if (pile) pile.appendChild(renderCardBack());
    if (hand) {
      const g = S.game;
      const n = (g.yourHand || []).length;
      (g.yourHand || []).forEach((c, i) => {
        const playable = g.currentUserId === S.user.id && g.status === 'playing' && isLegalClient(c, g);
        const el = renderCard(c, { playable });
        const mid = (n - 1) / 2;
        const fan = (i - mid) * (n > 8 ? 5.5 : 8.5);
        const lift = playable ? 32 : 6 + Math.abs(fan) * 0.55;
        el.style.setProperty('--fan', fan);
        el.style.setProperty('--lift', lift + 'px');
        el.style.zIndex = String(playable ? 40 + i : 10 + i);
        el.style.animationDelay = `${i * 40}ms`;
        el.addEventListener('click', () => onPlay(c));
        hand.appendChild(el);
      });
    }
  }
}

function onPlay(card) {
  if (!S.game || S.game.currentUserId !== S.user.id) return;
  if (card.special === 'whot' || card.rank === 20) {
    S.pendingWhot = card;
    render();
    return;
  }
  S.socket.emit('play_card', { gameId: S.game.id, cardId: card.id, declareLast: card && (S.game.yourHand.length === 2) });
}

async function go(view) {
  S.view = view;
  if (view === 'wallet') {
    try { S.wallet = await api.req('/api/wallet'); S.user.balance_kobo = S.wallet.balance_kobo; } catch (e) { toast(e.message); }
  }
  if (view === 'versus') {
    try { S.inbox = await api.req('/api/versus/inbox'); } catch { S.inbox = []; }
  }
  if (view === 'lobby' && S.user) {
    try {
      const me = await api.req('/api/me');
      S.user = me.user;
    } catch { /* */ }
  }
  render();
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-go],[data-tab],[data-acc],[data-dec],[data-shape],#enter,#practice,#logout,#toggle-chat,#btn-market,#btn-last,#show-dep,#show-wd,#voice,#music');
  if (!t) return;
  if (t.id === 'enter') {
    await audio.unlock();
    audio.playVoice('welcome', 'Welcome to 9ja Whot');
    if (S.user) { audio.startJazz(); go('lobby'); }
    else go('auth');
    return;
  }
  if (t.dataset.tab) { S.tab = t.dataset.tab; render(); return; }
  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.id === 'practice') {
    try {
      const r = await api.req('/api/practice', { method: 'POST', body: {} });
      S.view = 'table'; S.chat = []; render();
      S.socket.emit('join_game', r.gameId);
    } catch (err) { toast(err.message); }
    return;
  }
  if (t.id === 'logout') { api.setToken(''); S.user = null; S.socket?.disconnect(); go('splash'); return; }
  if (t.id === 'toggle-chat') { S.chatOpen = !S.chatOpen; render(); return; }
  if (t.id === 'btn-market') { S.socket.emit('draw_market', { gameId: S.game.id }); return; }
  if (t.id === 'btn-last') { S.socket.emit('last_card', { gameId: S.game.id }); return; }
  if (t.id === 'show-dep') { document.getElementById('dep-box').hidden = false; document.getElementById('wd-box').hidden = true; return; }
  if (t.id === 'show-wd') { document.getElementById('wd-box').hidden = false; document.getElementById('dep-box').hidden = true; return; }
  if (t.id === 'voice') {
    S.user.voice_on = t.checked;
    audio.setVoice(t.checked);
    api.req('/api/me/settings', { method: 'POST', body: { voice_on: t.checked, music_on: S.user.music_on } });
    return;
  }
  if (t.id === 'music') {
    S.user.music_on = t.checked;
    audio.setMusic(t.checked);
    api.req('/api/me/settings', { method: 'POST', body: { voice_on: S.user.voice_on, music_on: t.checked } });
    return;
  }
  if (t.dataset.acc) {
    try {
      const item = (S.inbox || []).find((c) => String(c.id) === String(t.dataset.acc));
      if (item && (item.kind === 'tournament' || item.tournament_id)) {
        await api.req(`/api/tournament/${item.tournament_id}/accept`, { method: 'POST', body: {} });
        toast('You joined the tournament. Wait for the host to start.');
        go('versus');
      } else {
        const r = await api.req(`/api/versus/${t.dataset.acc}/accept`, { method: 'POST', body: {} });
        S.view = 'table'; S.chat = []; render();
        S.socket.emit('join_game', r.gameId);
      }
    } catch (err) { toast(err.message); }
    return;
  }
  if (t.dataset.dec) {
    await api.req(`/api/versus/${t.dataset.dec}/decline`, { method: 'POST', body: {} });
    go('versus');
    return;
  }
  if (t.dataset.shape && S.pendingWhot) {
    const shape = t.dataset.shape;
    S.skipNeedVoice = true;
    audio.playVoice('need_' + shape, 'I need ' + suitLabel(shape));
    S.callout = 'I need ' + suitLabel(shape);
    S.socket.emit('play_card', { gameId: S.game.id, cardId: S.pendingWhot.id, calledSuit: shape });
    S.pendingWhot = null;
    render();
  }
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    if (form.id === 'auth-form') {
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      if (S.tab === 'register') {
        body.age18 = form.age18?.checked === true;
        body.terms = form.terms?.checked === true;
      }
      const path = S.tab === 'register' ? '/api/auth/register' : '/api/auth/login';
      const r = await api.req(path, { method: 'POST', body });
      api.setToken(r.token);
      S.user = r.user;
      if (S.user.is_admin) { window.location.replace('/admin'); return; }
      audio.setVoice(S.user.voice_on);
      audio.setMusic(S.user.music_on);
      connectSocket();
      await audio.unlock();
      audio.startJazz();
      audio.playVoice('welcome');
      go('lobby');
      return;
    }
    if (form.id === 'challenge-form') {
      const fd = Object.fromEntries(new FormData(form).entries());
      await api.req('/api/versus/challenge', { method: 'POST', body: { username: fd.username, amount: Number(fd.amount) } });
      toast('Challenge sent');
      form.reset();
      return;
    }
    if (form.id === 'tourney-form') {
      const fd = Object.fromEntries(new FormData(form).entries());
      const usernames = String(fd.usernames || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      const r = await api.req('/api/tournament', { method: 'POST', body: { amount: Number(fd.amount), usernames } });
      S.hostTourney = r.tournamentId;
      toast(`Invites sent · tournament #${r.tournamentId}`);
      return;
    }
    if (form.id === 'dep-form') {
      const fd = Object.fromEntries(new FormData(form).entries());
      const r = await api.req('/api/wallet/deposit', { method: 'POST', body: { amount: Number(fd.amount), note: fd.note } });
      toast('Reference ' + r.reference);
      S.wallet = await api.req('/api/wallet');
      render();
      return;
    }
    if (form.id === 'wd-form') {
      const fd = Object.fromEntries(new FormData(form).entries());
      await api.req('/api/wallet/withdraw', { method: 'POST', body: { ...fd, amount: Number(fd.amount) } });
      toast('Withdrawal queued');
      S.wallet = await api.req('/api/wallet');
      S.user.balance_kobo = S.wallet.balance_kobo;
      render();
      return;
    }
    if (form.id === 'chat-form') {
      const body = form.body.value;
      form.reset();
      S.socket.emit('chat', { gameId: S.game.id, body });
    }
  } catch (err) {
    toast(err.message);
  }
});

app.addEventListener('click', async (e) => {
  const b = e.target.closest('#start-t');
  if (!b) return;
  try {
    const r = await api.req(`/api/tournament/${b.dataset.tid}/start`, { method: 'POST', body: {} });
    S.view = 'table'; S.chat = []; render();
    S.socket.emit('join_game', r.gameId);
  } catch (err) { toast(err.message); }
});

/* particles */
const bits = [];
function resizeFx() { fx.width = innerWidth; fx.height = innerHeight; }
addEventListener('resize', resizeFx);
function burst(win) {
  for (let i = 0; i < 80; i++) {
    bits.push({
      x: innerWidth / 2, y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 8, vy: Math.random() * -6 - 1,
      life: 80, c: win ? '#e8c547' : '#1aad73',
    });
  }
}
function loopFx() {
  ctx.clearRect(0, 0, fx.width, fx.height);
  if (S.view === 'splash' || S.view === 'lobby') {
    ctx.fillStyle = 'rgba(232,197,71,.15)';
    const t = Date.now() / 800;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc((Math.sin(t + i) * 0.5 + 0.5) * fx.width, (Math.cos(t * 0.7 + i) * 0.5 + 0.5) * fx.height, 2, 0, 7);
      ctx.fill();
    }
  }
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.x += b.vx; b.y += b.vy; b.vy += 0.12; b.life--;
    ctx.fillStyle = b.c;
    ctx.fillRect(b.x, b.y, 4, 8);
    if (b.life <= 0) bits.splice(i, 1);
  }
  requestAnimationFrame(loopFx);
}

boot();
