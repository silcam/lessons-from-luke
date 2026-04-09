const { execSync } = require('child_process');
const fs = require('fs');

const env = process.env.TEST_DB ? 'test' : 'dev';
const stateFile = `.migrate-${env}`;

// Bootstrap: if env-specific state file doesn't exist but .migrate does,
// copy it as the initial state (handles transition from the old shared file).
if (!fs.existsSync(stateFile) && fs.existsSync('.migrate')) {
  fs.copyFileSync('.migrate', stateFile);
}

execSync(`npx migrate --state-file=${stateFile} up`, {
  stdio: 'inherit',
  env: { ...process.env }
});
