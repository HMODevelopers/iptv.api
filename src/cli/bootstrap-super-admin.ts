import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { config } from 'dotenv';
import { validate } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import db from '../database/data-source';
import { Permission, Role, RolePermission } from '../database/entities';
import { CreateUserDto } from '../security/dto';
import { bootstrapSuperAdmin } from '../security/bootstrap.service';
import { strongPassword } from '../security/auth.service';
import { PERMISSION_CODES } from '../security/policy';
import { securitySettings } from '../security/settings';
async function main() {
  config({ quiet: true });
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Ejecuta el comando en una terminal interactiva');
  const settings = securitySettings(new ConfigService());
  await db.initialize();
  try {
    await db.query('SELECT 1');
    if (await db.showMigrations()) throw new Error('Hay migraciones pendientes: ejecuta npm run migration:run');
    const role = await db.manager.findOneByOrFail(Role,{ name: 'SUPER_ADMIN', isSystem: true, isActive: true });
    for (const name of ['ADMIN','USER']) {
      await db.manager.findOneByOrFail(Role,{ name,isSystem: true,isActive: true });
    }
    const permissions = await db.manager.find(Permission);
    const links = await db.manager.findBy(RolePermission,{ roleId: role.id });
    if (!PERMISSION_CODES.every(code => permissions.some(p => p.code === code && links.some(l => l.permissionId === p.id)))) throw new Error('Roles y permisos incompletos');
    let muted = false;
    const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    const abort = new AbortController();
    rl.on('SIGINT',() => abort.abort());
    rl.on('close',() => abort.abort());
    const ask = (prompt: string) => rl.question(prompt,{ signal: abort.signal });
    const dto = new CreateUserDto();
    try {
      dto.username = (await ask('Username: ')).trim();
      dto.email = (await ask('Correo electrónico: ')).trim();
      dto.firstName = (await ask('Nombre: ')).trim();
      dto.lastName = (await ask('Apellido (opcional): ')).trim();
      process.stdout.write('Contraseña (entrada oculta): '); muted = true;
      dto.password = await ask(''); muted = false; process.stdout.write('\n');
      process.stdout.write('Confirmar contraseña (entrada oculta): '); muted = true;
      const confirm = await ask(''); muted = false; process.stdout.write('\n');
      if (dto.password !== confirm) throw new Error('Las contraseñas no coinciden');
      if ((await validate(dto)).length) throw new Error('Datos inválidos; revisa username, correo, nombre y longitud de contraseña');
      strongPassword(dto.password);
      const hash = await argon2.hash(dto.password,{ type: argon2.argon2id, memoryCost: settings.memoryCost, timeCost: settings.timeCost, parallelism: settings.parallelism });
      const account = await bootstrapSuperAdmin(db,dto,hash);
      dto.password = '';
      console.log(`SUPER_ADMIN creado: ${account.username} (id ${account.id})`);
    } finally { muted = false; rl.close(); }
  } finally { await db.destroy(); }
}
main().catch(error => {
  // Driver errors can include SQL values; expose only controlled application failures.
  const message = error instanceof Error && !('query' in error) ? error.message : 'Revisa conexión, esquema y duplicidad de cuenta';
  console.error(`Bootstrap fallido: ${message}`); process.exitCode = 1;
});
