import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { AppModule } from '../app.module';
import { StreamHealthService } from '../stream-health/service';
import { HealthQuery } from '../stream-health/dto';
async function main() {
  const options: Record<string,string> = {}; const args = process.argv.slice(2);
  const names: Record<string,string> = { '--provider': 'providerId','--channel': 'channelId','--stream': 'streamId','--status': 'status','--stale-minutes': 'staleMinutes','--force': 'force' };
  for (let i=0;i<args.length;i++) {
    const name = names[args[i]]; if (!name) throw new Error('Opción inválida');
    if (name === 'force') options[name] = 'true';
    else { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error('Falta valor'); options[name] = value; }
  }
  const query = plainToInstance(HealthQuery,options); await validateOrReject(query);
  const app = await NestFactory.createApplicationContext(AppModule);
  try { const run = await app.get(StreamHealthService).run(query); console.log(JSON.stringify(run)); if (run.errors) process.exitCode = 1; }
  finally { await app.close(); }
}
void main().catch(() => { console.error('Health fallido; revisa configuración e historial sanitizado'); process.exitCode = 1; });
