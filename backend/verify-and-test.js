// 1. Verify a user directly in DB
// 2. Login
// 3. Call /wallets/me
// 4. Print results

// Use the generated Prisma client
const { PrismaClient } = require('c:/Users/perum/OneDrive/Desktop/sidra/node_modules/.prisma/client');
// Load backend's .env explicitly
require('dotenv').config({ path: 'c:/Users/perum/OneDrive/Desktop/sidra/backend/.env' });
const http = require('http');

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const prisma = new PrismaClient();
  // Find a recently-registered user with a wallet
  const user = await prisma.user.findFirst({
    where: { email: { contains: 'wallet_test' } },
    include: { wallets: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!user) {
    console.log('No test user found');
    process.exit(1);
  }
  console.log('USER:', user.email, 'id:', user.id, 'verified:', user.emailVerified, 'status:', user.status);
  console.log('WALLETS in DB:', user.wallets.map((w) => `${w.chain}:${w.address}`));

  // Force verify
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, status: 'ACTIVE' },
  });
  console.log('User verified and activated');

  // Login
  const email = user.email;
  const password = 'Test1234!aaa';
  const loginOpts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify({ email, password })) },
  };
  const login = await request(loginOpts, JSON.stringify({ email, password }));
  console.log('\nLOGIN:', login.status, login.body);
  const loginJson = JSON.parse(login.body);
  if (!loginJson.data?.accessToken) {
    console.log('No access token, bailing');
    process.exit(1);
  }
  const accessToken = loginJson.data.accessToken;

  // Call /wallets/me
  const walletOpts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/wallets/me',
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  const w = await request(walletOpts);
  console.log('\nWALLETS /me response:', w.status);
  console.log('BODY:', w.body);

  // Try /users/me to confirm auth path
  const meOpts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/users/me',
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  const me = await request(meOpts);
  console.log('\nUSERS /me response:', me.status);
  console.log('BODY:', me.body);

  // Try /wallets/me/balances to see if the issue is wallet-specific
  const balOpts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/wallets/me/balances',
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  const bal = await request(balOpts);
  console.log('\nWALLETS /me/balances response:', bal.status);
  console.log('BODY:', bal.body);

  // Decode JWT
  const parts = accessToken.split('.');
  if (parts.length === 3) {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    console.log('\nJWT payload:', JSON.stringify(payload, null, 2));
  }

  await prisma.$disconnect();
})();
