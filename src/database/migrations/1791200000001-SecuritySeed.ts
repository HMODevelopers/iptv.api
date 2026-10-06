import { MigrationInterface, QueryRunner } from 'typeorm';
const PERMISSION_CODES = [
  'users.read','users.create','users.update','users.disable',
  'roles.read','roles.create','roles.update','roles.delete','permissions.read','permissions.assign',
  'channels.read','channels.manage','channels.publish','channels.hide','streams.read','streams.manage',
  'collections.read','collections.create','collections.update','collections.delete','collections.assign',
  'providers.read','providers.manage','sync.execute','sync.history','sessions.read','sessions.revoke','audit.read','settings.manage',
];

export class SecuritySeed1791200000001 implements MigrationInterface {
  name = 'SecuritySeed1791200000001';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query("INSERT IGNORE INTO channel_publications (channelId,status) SELECT id,'DRAFT' FROM channels");
    for (const code of PERMISSION_CODES) {
      await runner.query('INSERT IGNORE INTO permissions (code,description,module) VALUES (?,?,?)',[code,code,code.split('.')[0]]);
    }
    for (const name of ['SUPER_ADMIN','ADMIN','USER']) {
      await runner.query('INSERT IGNORE INTO roles (name,description,isSystem,isActive) VALUES (?,?,1,1)',[name,name]);
    }
    await runner.query(`INSERT IGNORE INTO role_permissions (roleId,permissionId)
      SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'SUPER_ADMIN'`);
  }
  async down(): Promise<void> {
    // Seed rollback preserves roles/permissions already assigned to accounts.
  }
}
