/* eslint-disable no-console */
/**
 * SIDRA EXCHANGE - SMTP delivery test.
 * Sends a real test email using the exact credentials from backend/.env.
 * Run from repo root: node scripts/test-smtp.js
 */
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '..', 'backend', '.env');
const ROOT_NM = path.resolve(__dirname, '..', 'node_modules');

// Minimal dotenv-style parser (no dependency resolution issues)
function loadEnv(file) {
  const env = {};
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const nodemailer = require(path.join(ROOT_NM, 'nodemailer'));

const host = env.SMTP_HOST;
const port = Number(env.SMTP_PORT || 587);
const user = env.SMTP_USER;
const pass = env.SMTP_PASS;
const to = env.SMTP_USER;

console.log(`SMTP test -> host=${host} port=${port} user=${user}`);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
  tls: { rejectUnauthorized: false },
});

transporter
  .sendMail({
    from: `"SIDRA Exchange" <${user}>`,
    to,
    subject: 'SIDRA EXCHANGE - SMTP Test',
    html:
      '<div style="font-family:Inter,sans-serif;padding:24px;background:#fff;">' +
      '<h2 style="color:#2b6aff;margin:0 0 12px 0;">SMTP is working!</h2>' +
      '<p style="color:#222;font-size:15px;line-height:1.6;margin:0;">' +
      'Email delivery is now configured for SIDRA EXCHANGE. ' +
      'Verification links, password resets, and OTP codes will now be delivered to your inbox.</p>' +
      '</div>',
  })
  .then((info) => {
    console.log('EMAIL SENT OK');
    console.log('Message ID:', info.messageId);
    console.log(`Check ${to} inbox for "SIDRA EXCHANGE - SMTP Test"`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('EMAIL FAILED:', err.message);
    if (err.response) console.error('SMTP response:', err.response);
    process.exit(1);
  });