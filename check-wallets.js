// Login as the test user, then list wallets
const http = require('http');

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  // 1. Register a brand new user
  const email = `wallet_test_${Date.now()}@example.com`;
  const password = 'Test1234!aaa';

  const regOpts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify({ email, password })) },
  };
  const reg = await request(regOpts, JSON.stringify({ email, password }));
  console.log('REGISTER:', reg.status, reg.body);

  // 2. Login
  const loginOpts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify({ email, password })) },
  };
  const login = await request(loginOpts, JSON.stringify({ email, password }));
  console.log('LOGIN:', login.status, login.body);
  const loginJson = JSON.parse(login.body);
  const accessToken = loginJson.data.accessToken;

  // 3. Get wallets
  const walletOpts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/wallets',
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  const w = await request(walletOpts);
  console.log('WALLETS:', w.status, w.body);
})();
