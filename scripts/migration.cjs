const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const [operation, name] = process.argv.slice(2);
const allowed = ['generate', 'create', 'run', 'revert', 'show'];
if (!allowed.includes(operation)) throw new Error('Operación inválida');
if (['generate','create'].includes(operation) && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name || '')) {
  console.error('Uso: npm run migration:' + operation + ' -- NombreMigracion'); process.exit(1);
}
const ts = existsSync(path.join(__dirname,'../src/database/data-source.ts'));
const cli = require.resolve('typeorm/cli.js');
const args = ts ? ['-r','ts-node/register',cli] : [cli];
args.push('migration:' + operation);
if (['generate','create'].includes(operation)) args.push('src/database/migrations/' + name);
if (operation !== 'create') args.push('-d', ts ? 'src/database/data-source.ts' : 'dist/database/data-source.js');
const result = spawnSync(process.execPath,args,{stdio:'inherit'});
process.exit(result.status ?? 1);
