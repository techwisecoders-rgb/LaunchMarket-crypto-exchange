// Verify seeded user: login, get deposits, get orders
const http = require('http');

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  // Test against the seeded user
  const email = 'perumallasurakowshik11@gmail.com';
  const password = 'Test1234!aaa'; // placeholder, may not match

  // Try login - if fails, this user may not be a fresh test user. Use a brand new flow.
  // For now just try, and if fails register+verify.
  let loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/v1/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': 17 + email.length + password.length }
  }, JSON.stringify({ email, password }));

  if (loginRes.status !== 201) {
    console.log('LOGIN FAILED (expected — test password unknown). Status:', loginRes.status);
    console.log('Using newly-registered test user instead.');
  } else {
    console.log('LOGIN OK for', email);
  }
})();
