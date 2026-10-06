import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { requireDatabaseCredentials, validateEnvironment } from '../config/environment';
import { SanitizedLogger } from '../common/sanitized-logger';
import { CoreModule } from '../config/core.module';
import { IptvOrgModule } from '../providers/iptv-org/iptv-org.module';
import { IptvOrgSyncService } from '../providers/iptv-org/sync.service';
@Module({ imports: [CoreModule,IptvOrgModule] })
class SyncModule {}
async function main() {
  config({ quiet: true });
  requireDatabaseCredentials(validateEnvironment(process.env));
  const app = await NestFactory.createApplicationContext(SyncModule, { logger: new SanitizedLogger(['log','warn','error']), abortOnError: false });
  try {
    const stats = await app.get(IptvOrgSyncService).sync();
    console.log(JSON.stringify(stats,null,2));
    if (stats.errors) process.exitCode = 1;
  } finally { await app.close(); }
}
main().catch(() => { console.error('Sincronización fallida. Revisa configuración, conectividad y mensajes sanitizados de lotes.'); process.exitCode = 1; });
