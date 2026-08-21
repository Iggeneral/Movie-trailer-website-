export const SUIT_META = {
  circle: { label: 'Circle', color: '#e23b3b', ink: '#8b1515' },
  triangle: { label: 'Triangle', color: '#e6b422', ink: '#7a5a08' },
  cross: { label: 'Cross', color: '#2d5be3', ink: '#1a327a' },
  square: { label: 'Square', color: '#1aa05a', ink: '#0c5a32' },
  star: { label: 'Star', color: '#f59e0b', ink: '#8a4b00' },
  whot: { label: 'WHOT', color: '#111', ink: '#111' },
};

function pipPath(suit) {
  switch (suit) {
    case 'circle':
      return `<circle cx="50" cy="50" r="28" fill="currentColor"/>`;
    case 'triangle':
      return `<polygon points="50,16 84,80 16,80" fill="currentColor"/>`;
    case 'cross':
      return `<rect x="38" y="14" width="24" height="72" rx="6" fill="currentColor"/><rect x="14" y="38" width="72" height="24" rx="6" fill="currentColor"/>`;
    case 'square':
      return `<rect x="20" y="20" width="60" height="60" rx="8" fill="currentColor"/>`;
    case 'star':
      return `<polygon points="50,10 61,38 92,40 68,60 76,90 50,74 24,90 32,60 8,40 39,38" fill="currentColor"/>`;
    default:
      return '';
  }
}

export function pipSvg(suit, size = 48) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}">${pipPath(suit)}</svg>`;
}

export function suitLabel(s) {
  return SUIT_META[s]?.label || s;
}

export function renderCard(card, opts = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'whot-card' + (opts.playable ? ' is-playable' : '') + (opts.compact ? ' is-compact' : '');
  el.dataset.id = card.id;
  if (opts.playable) el.dataset.playable = '1';

  if (card.suit === 'whot' || card.rank === 20) {
    el.innerHTML = `
      <div class="card-3d">
        <div class="card-edge"></div>
        <div class="whot-card-face is-whot">
          <div class="whot-burst"></div>
          <div class="whot-word">WHOT</div>
          <div class="whot-20">20</div>
          <div class="whot-mini">TAP TO CALL A SHAPE</div>
        </div>
      </div>`;
    return el;
  }

  const meta = SUIT_META[card.suit] || SUIT_META.circle;
  const special = {
    1: 'HOLD ON',
    2: 'PICK TWO',
    5: 'PICK THREE',
    8: 'SUSPENSION',
    14: 'GEN. MARKET',
  }[card.rank];

  el.style.setProperty('--pip', meta.color);
  el.style.setProperty('--ink', meta.ink);
  const pip = (size) => pipSvg(card.suit, size);
  el.innerHTML = `
    <div class="card-3d">
      <div class="card-edge"></div>
      <div class="whot-card-face">
        <div class="corner tl"><span>${card.rank}</span>${pip(14)}</div>
        <div class="pip-hero">${pip(100)}</div>
        <div class="rank-hero">${card.rank}</div>
        ${special ? `<div class="special-tag">${special}</div>` : ''}
        <div class="corner br"><span>${card.rank}</span>${pip(14)}</div>
      </div>
    </div>`;
  return el;
}

export function renderCardBack() {
  const el = document.createElement('div');
  el.className = 'whot-card is-back';
  el.innerHTML = `<div class="card-3d"><div class="card-edge"></div><div class="whot-card-back"><span>9W</span></div></div>`;
  return el;
}
