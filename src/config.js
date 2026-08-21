'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    return process.env.JWT_SECRET;
  }
  const p = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(p, s, { mode: 0o600 });
  return s;
}

module.exports = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  JWT_SECRET: loadSecret(),
  ADMIN_USERNAME: String(process.env.ADMIN_USERNAME || 'admin').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ChangeMe_9jaWhot!',
  MIN_BET_KOBO: 10000,
  MIN_WITHDRAW_KOBO: 10000,
  MAX_PENDING_WITHDRAWALS: 50,
  RAKE_BPS: 500,
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, '9jawhot.db'),
};
