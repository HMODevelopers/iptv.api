import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const m3uFixture = (name: string) => readFileSync(join(__dirname,'m3u-fixtures',`${name}.m3u`),'utf8');
