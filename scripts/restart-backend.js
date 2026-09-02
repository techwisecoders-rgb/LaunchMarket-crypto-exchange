/* eslint-disable no-console */
const { execSync, spawn } = require('child_process');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', 'backend');
const LOG_FILE = path.resolve(__dirname, '..', 'backend-start.log');

function killPort(port) {
  try {
    const netstat = execSync('netstat -ano', { encoding: 'utf8' });
    const lines = netstat.split(/\r?\n/);
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[1] && parts[1].endsWith(`:${port}`) && parts[3] === 'LISTENING' && parts[4]) {
        pids.add(parts[4]);
      }
    }
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGKILL');
        console.log(`Killed process ${pid} on port ${port}`);
      } catch (err) {
        console.log(`Could not kill ${pid}: ${err.message}`);
      }
    }
    return pids.size > 0;
  } catch (err) {
    console.error('netstat failed:', err.message);
    return false;
  }
}

killPort(3001);
setTimeout(() => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = `${LOG_FILE.replace('.log', '')}-${stamp}.log`;
  const logFd = require('fs').openSync(logFile, 'a');
  const child = spawn('npx', ['nest', 'start'], {
    cwd: BACKEND_DIR,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    shell: process.platform === 'win32',
  });
  child.unref();
  console.log(`Backend restarting in ${BACKEND_DIR} -> ${logFile}`);
}, 3000);
