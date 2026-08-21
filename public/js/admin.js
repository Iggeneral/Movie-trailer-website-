const root = document.getElementById('root');
const api = {
  token: localStorage.getItem('jw_admin') || localStorage.getItem('jw_token') || '',
  async req(path, { method = 'GET', body } = {}) {
    const r = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Failed');
    return data;
  },
};
const ngn = (k) => '₦' + (Number(k || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let dash = null;
let tab = 'deposits';

function loginView(err) {
  root.innerHTML = `
    <h1>9jaWhot</h1>
    <form class="panel stack" id="login" style="max-width:420px;margin-top:16px">
      <input name="username" placeholder="Username" required autocomplete="username"/>
      <input name="password" type="password" placeholder="Password" required autocomplete="current-password"/>
      <button class="btn gold">Enter</button>
      ${err ? `<p class="muted">${err}</p>` : ''}
    </form>`;
  document.getElementById('login').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fd) }).then((x) => x.json());
      if (!r.token) throw new Error(r.error || 'Login failed');
      if (!r.user.is_admin) throw new Error('Wrong username or password');
      api.token = r.token;
      localStorage.setItem('jw_admin', r.token);
      load();
    } catch (err2) { loginView(err2.message); }
  };
}

async function load() {
  try { dash = await api.req('/api/admin/dashboard'); } catch (e) { return loginView(e.message); }
  const deposits = await api.req('/api/admin/deposits?status=pending');
  const withdrawals = await api.req('/api/admin/withdrawals?status=pending');
  const users = await api.req('/api/admin/users');
  const s = dash.settings || {};
  root.innerHTML = `
    <div class="top">
      <div><h1>House desk</h1><p class="muted">Balances are server-side. Approving a deposit is the only way funds appear.</p></div>
      <div><a class="btn ghost" href="/">App</a> <button class="btn ghost" id="out">Sign out</button></div>
    </div>
    <div class="note">
      Real naira from player transfers sits in your <b>deposit</b> bank account. The in-app ledger is an IOU.
      User balances (${dash.format.liability}) are what you still owe. House rake (${dash.format.house}) is your 5% — already inside that float; sweep it to the profit account when you like.
      Automatic bank hops need a licensed processor (Paystack / Flutterwave Transfers). Until then, pay withdrawals from the deposit account after you confirm the row here.
    </div>
    <div class="grid">
      <div class="stat"><b>${dash.format.liability}</b><span>Player balances (liability)</span></div>
      <div class="stat"><b>${dash.format.house}</b><span>House 5% (book)</span></div>
      <div class="stat"><b>${dash.pending_deposits.c}</b><span>Pending deposits · ${ngn(dash.pending_deposits.s)}</span></div>
      <div class="stat"><b>${dash.pending_withdrawals.c}/50</b><span>Pending withdrawals · ${ngn(dash.pending_withdrawals.s)}</span></div>
      <div class="stat"><b>${dash.users}</b><span>Players</span></div>
      <div class="stat"><b>${dash.reconcile.ok ? 'Clean' : dash.reconcile.issues.length + ' issues'}</b><span>Ledger reconcile</span></div>
    </div>
    <div class="panel">
      <h3>Bank accounts (players see deposit; you keep profit details)</h3>
      <form id="bank" class="stack" style="margin-top:10px">
        <b class="muted">Deposit account</b>
        <input name="deposit_bank_name" value="${esc(s.deposit_bank_name)}" placeholder="Bank name"/>
        <input name="deposit_account_number" value="${esc(s.deposit_account_number)}" placeholder="Account number"/>
        <input name="deposit_account_name" value="${esc(s.deposit_account_name)}" placeholder="Account name"/>
        <b class="muted">Profit / rake account (bookkeeping)</b>
        <input name="rake_bank_name" value="${esc(s.rake_bank_name)}" placeholder="Bank name"/>
        <input name="rake_account_number" value="${esc(s.rake_account_number)}" placeholder="Account number"/>
        <input name="rake_account_name" value="${esc(s.rake_account_name)}" placeholder="Account name"/>
        <button class="btn gold">Save accounts</button>
      </form>
    </div>
    <div class="tabs">
      <button class="btn ${tab==='deposits'?'gold':'ghost'}" data-tab="deposits">Deposits</button>
      <button class="btn ${tab==='withdrawals'?'gold':'ghost'}" data-tab="withdrawals">Withdrawals</button>
      <button class="btn ${tab==='users'?'gold':'ghost'}" data-tab="users">Users</button>
    </div>
    <div class="panel" id="main"></div>
    <div class="panel">
      <h3>Change admin password</h3>
      <form id="pw" class="stack" style="max-width:420px;margin-top:8px">
        <input name="current" type="password" placeholder="Current"/>
        <input name="next" type="password" placeholder="New (8+ letter & number)"/>
        <button class="btn ghost">Update</button>
      </form>
    </div>`;

  const main = document.getElementById('main');
  if (tab === 'deposits') {
    main.innerHTML = deposits.length ? deposits.map((d) => `
      <div class="row">
        <div><b>${esc(d.username)}</b> · ${ngn(d.amount_kobo)}<div class="muted">${d.reference} · ${esc(d.note || '')}</div></div>
        <div>
          <button class="btn ok" data-dep="${d.id}" data-act="approve">Credit</button>
          <button class="btn bad" data-dep="${d.id}" data-act="reject">Reject</button>
        </div>
      </div>`).join('') : '<p class="muted">No pending deposits.</p>';
  } else if (tab === 'withdrawals') {
    main.innerHTML = withdrawals.length ? withdrawals.map((w) => `
      <div class="row">
        <div><b>${esc(w.username)}</b> · ${ngn(w.amount_kobo)}
          <div class="muted">${esc(w.bank_name)} · ${esc(w.account_number)} · ${esc(w.account_name)}</div>
        </div>
        <div>
          <button class="btn ok" data-wd="${w.id}" data-act="paid">Mark paid</button>
          <button class="btn bad" data-wd="${w.id}" data-act="reject">Return funds</button>
        </div>
      </div>`).join('') : '<p class="muted">No pending withdrawals.</p>';
  } else {
    main.innerHTML = `<table><thead><tr><th>User</th><th>Country</th><th>Balance</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td>${esc(u.username)}</td><td>${u.country}</td><td>${ngn(u.balance_kobo)}</td>
      <td><button class="btn ${u.is_banned?'ok':'bad'}" data-ban="${u.id}" data-on="${u.is_banned?0:1}">${u.is_banned?'Unban':'Ban'}</button></td></tr>`).join('')}
    </tbody></table>`;
  }

  document.getElementById('out').onclick = () => { localStorage.removeItem('jw_admin'); location.reload(); };
  document.getElementById('bank').onsubmit = async (e) => {
    e.preventDefault();
    await api.req('/api/admin/bank', { method: 'PUT', body: Object.fromEntries(new FormData(e.target).entries()) });
    load();
  };
  document.getElementById('pw').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    const r = await api.req('/api/admin/password', { method: 'POST', body });
    api.token = r.token; localStorage.setItem('jw_admin', r.token);
    alert('Password updated. All old sessions died.');
  };
  root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; load(); });
  root.querySelectorAll('[data-dep]').forEach((b) => b.onclick = async () => {
    await api.req(`/api/admin/deposits/${b.dataset.dep}/${b.dataset.act}`, { method: 'POST', body: {} });
    load();
  });
  root.querySelectorAll('[data-wd]').forEach((b) => b.onclick = async () => {
    await api.req(`/api/admin/withdrawals/${b.dataset.wd}/${b.dataset.act}`, { method: 'POST', body: {} });
    load();
  });
  root.querySelectorAll('[data-ban]').forEach((b) => b.onclick = async () => {
    await api.req(`/api/admin/users/${b.dataset.ban}/ban`, { method: 'POST', body: { ban: b.dataset.on === '1' } });
    load();
  });
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

if (api.token) load(); else loginView();
