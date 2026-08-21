'use strict';

const { RAKE_BPS, MIN_BET_KOBO } = require('./config');

function nairaToKobo(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) {
    const err = new Error('Invalid amount');
    err.status = 400;
    throw err;
  }
  return Math.round(x * 100);
}

function formatNGN(kobo) {
  const n = Number(kobo || 0) / 100;
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rakeFromStake(stakeKobo) {
  return Math.floor((Number(stakeKobo) * RAKE_BPS) / 10000);
}

function settlePayout(stakeKobo, loserCount) {
  const rakeEach = rakeFromStake(stakeKobo);
  const fromLosers = (stakeKobo - rakeEach) * loserCount;
  return {
    rakeEach,
    houseRake: rakeEach * loserCount,
    winnerPayout: stakeKobo + fromLosers,
  };
}

function assertBet(naira) {
  const kobo = nairaToKobo(naira);
  if (kobo < MIN_BET_KOBO) {
    const err = new Error('Minimum stake is ₦100');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(kobo) || kobo > 50_000_000_00) {
    const err = new Error('Stake too large');
    err.status = 400;
    throw err;
  }
  return kobo;
}

module.exports = { nairaToKobo, formatNGN, rakeFromStake, settlePayout, assertBet };
