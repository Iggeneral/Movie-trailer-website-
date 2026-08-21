'use strict';

const { SUITS } = require('./whot');

function pickBotMove(game, userId) {
  const player = game.player(userId);
  if (!player) return { type: 'draw' };

  if (player.hand.length === 2) {
    try {
      game.sayLastCard(userId);
    } catch {
      /* ignore */
    }
  }

  const legal = game.legalCards(userId);
  if (!legal.length) return { type: 'draw' };

  const oppMin = Math.min(
    ...game.players.filter((p) => p.userId !== userId).map((p) => p.hand.length)
  );

  const score = (card) => {
    let s = 0;
    if (card.rank === 2 || card.rank === 5) s += oppMin <= 2 ? 40 : 8;
    if (card.rank === 1) s += 12;
    if (card.rank === 8) s += 10;
    if (card.rank === 14) s += 9;
    if (card.special === 'whot') s += legal.length === 1 ? 50 : -4;
    if (player.hand.length === 1) s += 100;
    const sameSuit = player.hand.filter((c) => c.suit === card.suit).length;
    s += sameSuit;
    s += card.rank / 20;
    return s;
  };

  legal.sort((a, b) => score(b) - score(a));
  const card = legal[0];
  const extra = {};
  if (card.special === 'whot') extra.calledSuit = game.majoritySuit(player) || SUITS[0];
  if (player.hand.length === 2) extra.declareLast = true;
  return { type: 'play', cardId: card.id, extra };
}

module.exports = { pickBotMove };
