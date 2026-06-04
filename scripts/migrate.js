const { execSync } = require('child_process');
const fs = require('fs');

const env = process.env.TEST_DB ? 'test' : process.env.DEV_DB ? 'dev' : 'prod';
const stateFile = `.migrate-${env}`;

// Bootstrap: if env-specific state file doesn't exist but .migrate does,
// copy it as the initial state (handles transition from the old shared file).
if (!fs.existsSync(stateFile) && fs.existsSync('.migrate')) {
  fs.copyFileSync('.migrate', stateFile);
}

// Match only timestamp-prefixed migration files; skip helpers like _helpers.js
execSync(`npx migrate --state-file=${stateFile} --matches '[0-9]*.js' up`, {
  stdio: 'inherit',
  env: { ...process.env }
});
