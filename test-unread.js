// Login and check the unread-count endpoint
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
  // Login as the verified test user
  const loginOpts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify({ email: 'wallet_test_1787925135763@example.com', password: 'Test1234!aaa' })) },
  };
  const login = await request(loginOpts, JSON.stringify({ email: 'wallet_test_1787925135763@example.com', password: 'Test1234!aaa' }));
  const loginJson = JSON.parse(login.body);
  const accessToken = loginJson.data?.accessToken;
  if (!accessToken) {
    console.log('LOGIN FAILED:', login.body);
    return;
  }
  console.log('LOGIN OK');

  // Test unread-count
  const opts = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/notifications/unread-count',
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  const r = await request(opts);
  console.log('UNREAD-COUNT RESPONSE:', r.body);
  const parsed = JSON.parse(r.body);
  console.log('data type:', typeof parsed.data);
  console.log('data value:', JSON.stringify(parsed.data));
  console.log('Is bare number?:', typeof parsed.data === 'number');
})();
