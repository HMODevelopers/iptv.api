const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const source = resolve(__dirname, '../src/cli/bootstrap-super-admin.ts');
const compiled = resolve(__dirname, '../dist/cli/bootstrap-super-admin.js');
const args = existsSync(source) ? ['-r', 'ts-node/register', source] : [compiled];
if (!existsSync(source) && !existsSync(compiled)) {
  console.error('Compila la API antes de ejecutar bootstrap.');
  process.exit(1);
}
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
