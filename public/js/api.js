export const api = {
  token: localStorage.getItem('jw_token') || '',

  setToken(t) {
    this.token = t || '';
    if (t) localStorage.setItem('jw_token', t);
    else localStorage.removeItem('jw_token');
  },

  async req(path, { method = 'GET', body } = {}) {
    const r = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  },
};

export function ngn(kobo) {
  const n = Number(kobo || 0) / 100;
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const FLAG = (cc) => {
  if (!cc || cc.length !== 2) return '🏳️';
  const A = 127397;
  return String.fromCodePoint(...cc.toUpperCase().split('').map((c) => A + c.charCodeAt(0)));
};
