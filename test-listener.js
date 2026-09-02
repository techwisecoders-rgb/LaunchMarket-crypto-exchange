// Check if backend is listening
const net = require('net');
const sock = new net.Socket();
sock.setTimeout(2000);
sock.on('connect', () => {
  console.log('CONNECTED: backend listening on 3001');
  sock.destroy();
});
sock.on('timeout', () => {
  console.log('TIMEOUT: not listening');
  sock.destroy();
});
sock.on('error', (e) => {
  console.log('ERROR:', e.code);
});
sock.connect(3001, 'localhost');
