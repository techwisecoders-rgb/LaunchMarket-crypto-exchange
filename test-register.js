// Simple test script to register and check wallet creation
const http = require('http');

const data = JSON.stringify({
  email: `test${Date.now()}@example.com`,
  password: 'Test1234!aaa',
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/v1/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
  });
});

req.on('error', (e) => console.error('ERR:', e.message));
req.write(data);
req.end();
