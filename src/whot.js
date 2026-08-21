'use strict';

const crypto = require('crypto');

const SUITS = ['circle', 'triangle', 'cross', 'square', 'star'];

const DECK_RANKS = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
};

function specialOf(rank) {
  switch (rank) {
    case 1: return 'hold_on';
    case 2: return 'pick_two';
    case 5: return 'pick_three';
    case 8: return 'suspension';
    case 14: return 'general_market';
    case 20: return 'whot';
    default: return null;
  }
}

function buildDeck() {
  const cards = [];
  let id = 1;
  for (const [suit, ranks] of Object.entries(DECK_RANKS)) {
    for (const rank of ranks) {
      cards.push({ id: id++, suit, rank, special: specialOf(rank) });
    }
  }
  cards.push({ id: id++, suit: 'whot', rank: 20, special: 'whot' });
  cards.push({ id: id++, suit: 'whot', rank: 20, special: 'whot' });
  return cards;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealCount(n) {
  if (n <= 2) return 5;
  if (n <= 6) return 4;
  return 3;
}

class WhotGame {
  constructor({ id, type, playerInfos, betKobo = 0 }) {
    this.id = id;
    this.type = type;
    this.betKobo = betKobo;
    this.status = 'playing';
    this.players = playerInfos.map((p, i) => ({
      userId: p.userId,
      username: p.username,
      country: p.country || 'NG',
      isBot: !!p.isBot,
      seat: i,
      hand: [],
      saidLast: false,
      connected: true,
      missedTurns: 0,
    }));
    this.market = [];
    this.discard = [];
    this.calledSuit = null;
    this.pending = null;
    this.currentIndex = 0;
    this.winnerId = null;
    this.turnSeq = 0;
    this.lastEvents = [];
    this.startedAt = Date.now();
    this.turnStartedAt = Date.now();
    this.deal();
  }

  deal() {
    this.market = shuffle(buildDeck());
    const n = dealCount(this.players.length);
    for (let r = 0; r < n; r++) {
      for (const p of this.players) p.hand.push(this.market.pop());
    }
    let starter = this.market.pop();
    while (starter && (starter.special === 'whot' || starter.special)) {
      this.market.unshift(starter);
      this.market = shuffle(this.market);
      starter = this.market.pop();
    }
    if (!starter) starter = { id: 0, suit: 'circle', rank: 3, special: null };
    this.discard = [starter];
    this.calledSuit = null;
    this.pending = null;
    this.currentIndex = 0;
    this.turnStartedAt = Date.now();
    this.lastEvents = [{ voice: 'welcome', text: 'Market is open. Match shape or number.' }];
  }

  get current() {
    return this.players[this.currentIndex];
  }

  top() {
    return this.discard[this.discard.length - 1];
  }

  reshuffleIfNeeded() {
    if (this.market.length > 0) return;
    if (this.discard.length <= 1) return;
    const top = this.discard.pop();
    this.market = shuffle(this.discard);
    this.discard = [top];
  }

  drawTo(player, n) {
    const taken = [];
    for (let i = 0; i < n; i++) {
      this.reshuffleIfNeeded();
      if (!this.market.length) break;
      taken.push(this.market.pop());
    }
    player.hand.push(...taken);
    if (player.hand.length > 1) player.saidLast = false;
    return taken;
  }

  isLegal(card) {
    if (this.pending) {
      if (this.pending.type === 'pick_two') return card.rank === 2;
      if (this.pending.type === 'pick_three') return card.rank === 5;
      return false;
    }
    if (card.special === 'whot') return true;
    const top = this.top();
    if (this.calledSuit) return card.suit === this.calledSuit;
    return card.suit === top.suit || card.rank === top.rank;
  }

  legalCards(userId) {
    const p = this.player(userId);
    if (!p) return [];
    return p.hand.filter((c) => {
      if (c.special === 'whot' && p.hand.length === 1) return false;
      return this.isLegal(c);
    });
  }

  player(userId) {
    return this.players.find((p) => p.userId === userId);
  }

  advance(steps = 1) {
    for (let i = 0; i < steps; i++) {
      this.currentIndex = (this.currentIndex + 1) % this.players.length;
    }
    this.turnSeq += 1;
    this.turnStartedAt = Date.now();
    this.current.missedTurns = 0;
  }

  playCard(userId, cardId, extra = {}) {
    if (this.status !== 'playing') throw Object.assign(new Error('Game is over'), { status: 400 });
    const player = this.player(userId);
    if (!player) throw Object.assign(new Error('Not at this table'), { status: 403 });
    if (this.current.userId !== userId) throw Object.assign(new Error('Not your turn'), { status: 400 });

    const idx = player.hand.findIndex((c) => c.id === Number(cardId));
    if (idx < 0) throw Object.assign(new Error('That card is not in your hand'), { status: 400 });
    const card = player.hand[idx];

    if (card.special === 'whot' && player.hand.length === 1) {
      throw Object.assign(new Error('You cannot finish on a WHOT card — go to market'), { status: 400 });
    }
    if (!this.isLegal(card)) {
      throw Object.assign(new Error('Card does not match the call'), { status: 400 });
    }
    if (card.special === 'whot') {
      if (!SUITS.includes(extra.calledSuit)) {
        throw Object.assign(new Error('Call a shape after WHOT'), { status: 400 });
      }
    }

    player.hand.splice(idx, 1);
    this.discard.push(card);
    this.calledSuit = card.special === 'whot' ? extra.calledSuit : null;

    const events = [];
    if (extra.declareLast || player.saidLast) player.saidLast = true;

    if (player.hand.length === 1 && !player.saidLast) {
      this.drawTo(player, 2);
      events.push({ voice: null, text: `${player.username} forgot last card — pick two as penalty.` });
    } else if (player.hand.length === 1 && player.saidLast) {
      events.push({ voice: 'last_card', text: `${player.username}: last card!` });
    }

    if (player.hand.length === 0) {
      this.status = 'finished';
      this.winnerId = userId;
      events.push({
        voice: 'you_win',
        text: `${player.username} has emptied the hand. Winner!`,
        winnerId: userId,
      });
      this.lastEvents = events;
      return { events, winnerId: userId };
    }

    if (player.hand.length !== 1) player.saidLast = false;

    if (this.pending && ((this.pending.type === 'pick_two' && card.rank === 2) || (this.pending.type === 'pick_three' && card.rank === 5))) {
      this.pending.stacks += 1;
      events.push({
        voice: card.rank === 2 ? 'pick_two' : 'pick_three',
        text: `${player.username} defends — stack ${this.pending.stacks}!`,
      });
      this.advance();
      this.lastEvents = events;
      return { events };
    }

    this.pending = null;

    if (card.rank === 2) {
      this.pending = { type: 'pick_two', stacks: 1 };
      events.push({ voice: 'pick_two', text: `${player.username}: pick two!` });
      this.advance();
    } else if (card.rank === 5) {
      this.pending = { type: 'pick_three', stacks: 1 };
      events.push({ voice: 'pick_three', text: `${player.username}: pick three!` });
      this.advance();
    } else if (card.rank === 1) {
      events.push({ voice: 'hold_on', text: `${player.username}: hold on!` });
      this.turnSeq += 1;
      this.turnStartedAt = Date.now();
    } else if (card.rank === 8) {
      events.push({ voice: 'suspension', text: `${player.username}: suspension!` });
      this.advance(this.players.length === 2 ? 2 : 2);
    } else if (card.rank === 14) {
      for (const p of this.players) {
        if (p.userId !== userId) this.drawTo(p, 1);
      }
      events.push({ voice: 'general_market', text: `${player.username}: general market!` });
      this.advance();
    } else if (card.special === 'whot') {
      events.push({
        voice: `need_${extra.calledSuit}`,
        text: `I need ${extra.calledSuit}`,
        calledSuit: extra.calledSuit,
      });
      this.advance();
    } else {
      this.advance();
    }

    this.lastEvents = events;
    return { events };
  }

  drawMarket(userId) {
    if (this.status !== 'playing') throw Object.assign(new Error('Game is over'), { status: 400 });
    if (this.current.userId !== userId) throw Object.assign(new Error('Not your turn'), { status: 400 });
    const player = this.player(userId);
    const events = [];

    if (this.pending) {
      const n = this.pending.type === 'pick_two' ? 2 * this.pending.stacks : 3 * this.pending.stacks;
      this.drawTo(player, n);
      events.push({
        voice: this.pending.type === 'pick_two' ? 'pick_two' : 'pick_three',
        text: `${player.username} goes to market for ${n}.`,
      });
      this.pending = null;
      this.advance();
      this.lastEvents = events;
      return { events };
    }

    const legal = this.legalCards(userId);
    if (legal.length) {
      throw Object.assign(new Error('You have a card to play'), { status: 400 });
    }
    this.drawTo(player, 1);
    events.push({ voice: null, text: `${player.username} went to market.` });
    this.advance();
    this.lastEvents = events;
    return { events };
  }

  sayLastCard(userId) {
    const player = this.player(userId);
    if (!player) throw Object.assign(new Error('Not at this table'), { status: 403 });
    if (player.hand.length !== 2 && player.hand.length !== 1) {
      throw Object.assign(new Error('Last card is only when you have two cards (about to play one)'), { status: 400 });
    }
    player.saidLast = true;
    const events = [{ voice: 'last_card', text: `${player.username}: last card!` }];
    this.lastEvents = events;
    return { events };
  }

  timeoutDraw() {
    if (this.status !== 'playing') return null;
    const userId = this.current.userId;
    this.current.missedTurns += 1;
    try {
      if (this.pending) return this.drawMarket(userId);
      const legal = this.legalCards(userId);
      if (legal.length) {
        const card = legal[0];
        const extra = card.special === 'whot' ? { calledSuit: this.majoritySuit(this.current) } : {};
        return this.playCard(userId, card.id, extra);
      }
      return this.drawMarket(userId);
    } catch {
      this.drawTo(this.current, 1);
      this.pending = null;
      this.advance();
      return { events: [{ text: `${this.current.username} stalled — market.` }] };
    }
  }

  majoritySuit(player) {
    const counts = {};
    for (const c of player.hand) {
      if (c.suit === 'whot') continue;
      counts[c.suit] = (counts[c.suit] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'circle';
  }

  publicState(forUserId) {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      betKobo: this.betKobo,
      callCard: this.top(),
      calledSuit: this.calledSuit,
      marketCount: this.market.length,
      currentUserId: this.current?.userId,
      currentUsername: this.current?.username,
      pending: this.pending,
      winnerId: this.winnerId,
      turnSeq: this.turnSeq,
      turnStartedAt: this.turnStartedAt,
      lastEvents: this.lastEvents,
      players: this.players.map((p) => ({
        userId: p.userId,
        username: p.username,
        country: p.country,
        isBot: p.isBot,
        seat: p.seat,
        cardCount: p.hand.length,
        saidLast: p.saidLast,
        connected: p.connected,
        isTurn: this.current?.userId === p.userId,
      })),
      yourHand: this.player(forUserId)?.hand || [],
      you: forUserId,
    };
  }

  serialize() {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      betKobo: this.betKobo,
      status: this.status,
      players: this.players,
      market: this.market,
      discard: this.discard,
      calledSuit: this.calledSuit,
      pending: this.pending,
      currentIndex: this.currentIndex,
      winnerId: this.winnerId,
      turnSeq: this.turnSeq,
      lastEvents: this.lastEvents,
      startedAt: this.startedAt,
      turnStartedAt: this.turnStartedAt,
    });
  }

  static deserialize(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    const g = Object.create(WhotGame.prototype);
    Object.assign(g, d);
    return g;
  }
}

module.exports = { WhotGame, SUITS, specialOf };
