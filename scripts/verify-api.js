/* eslint-disable no-console */
/**
 * SIDRA EXCHANGE - API smoke verification.
 * Writes each result to a file synchronously so results persist
 * even if the harness terminates the process mid-run.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');

const BASE = 'http://localhost:3001/api/v1';
const RESULT_FILE = path.join(__dirname, 'verify-results.txt');
const TIMEOUT_MS = 8000;

function log(line) {
  console.log(line);
  fs.appendFileSync(RESULT_FILE, `${line}\n`, 'utf8');
}

function formatRes(label, res, body) {
  let text = `${res.status} - ${typeof body === 'string' ? body : JSON.stringify(body)}`;
  if (text.length > 220) text = `${text.slice(0, 220)}...`;
  log(`[${label}] ${text}`);
}

async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.setTimeout(3000);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => resolve(false));
  });
}

async function main() {
  fs.writeFileSync(RESULT_FILE, '', 'utf8');
  log('=== SIDRA EXCHANGE API VERIFICATION ===');
  log(`started: ${new Date().toISOString()}`);
  log('');

  const open = await portOpen(3001);
  log(`[PORT 3001] ${open ? 'LISTENING' : 'CLOSED'}`);

  try {
    const res = await apiFetch(`${BASE}/health`);
    const body = await res.json();
    formatRes('HEALTH', res, body);
  } catch (err) {
    log(`[HEALTH] ERROR - ${err.message}`);
  }

  const email = `verify-${Date.now()}@sidra.test`;
  const password = 'StrongPass123!';
  try {
    const res = await apiFetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    formatRes('REGISTER', res, body);
  } catch (err) {
    log(`[REGISTER] ERROR - ${err.message}`);
  }

  try {
    const res = await apiFetch(`${BASE}/public/trading-pairs`);
    const body = await res.json();
    formatRes('TRADING PAIRS', res, body);
  } catch (err) {
    log(`[TRADING PAIRS] ERROR - ${err.message}`);
  }

  try {
    const res = await apiFetch(`${BASE}/public/tokens`);
    const body = await res.json();
    formatRes('TOKENS', res, body);
  } catch (err) {
    log(`[TOKENS] ERROR - ${err.message}`);
  }

  try {
    const res = await apiFetch(`${BASE}/public/settings`);
    const body = await res.json();
    formatRes('PUBLIC SETTINGS', res, body);
  } catch (err) {
    log(`[PUBLIC SETTINGS] ERROR - ${err.message}`);
  }

  try {
    const res = await apiFetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    formatRes('LOGIN (unverified)', res, body);
  } catch (err) {
    log(`[LOGIN] ERROR - ${err.message}`);
  }

  log('');
  log('=== COMPLETE ===');
  process.exit(0);
}

main().catch((err) => {
  log(`FATAL - ${err.stack || err.message}`);
  process.exit(1);
});