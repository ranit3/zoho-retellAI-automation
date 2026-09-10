const { exec } = require('child_process');

process.env.CONTROL_MODE = 'true';
require('./server');

const port = process.env.PORT || 3000;
const url = `http://localhost:${port}`;

setTimeout(() => {
  exec(`start "" "${url}"`);
}, 500);

console.log(`Zoho control app ready at ${url}`);