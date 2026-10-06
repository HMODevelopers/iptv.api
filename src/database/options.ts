import { DataSourceOptions } from 'typeorm';
import { Environment, requireDatabaseCredentials } from '../config/environment';
import { ENTITIES } from './entities';
import { join } from 'node:path';

export function databaseOptions(env: Environment): DataSourceOptions {
  requireDatabaseCredentials(env);
  return {
    type: 'mariadb', host: env.DB_HOST, port: env.DB_PORT,
    username: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE,
    synchronize: false, migrationsRun: false,
    // Never print SQL parameters (stream URLs may contain credentials).
    logging: env.DB_LOGGING ? ['schema', 'migration'] : false,
    ssl: env.DB_SSL ? { rejectUnauthorized: true } : undefined,
    extra: { connectionLimit: env.DB_CONNECTION_LIMIT },
    charset: 'utf8mb4', timezone: 'Z', entities: ENTITIES,
    migrations: [join(__dirname, 'migrations/*{.ts,.js}')], migrationsTableName: 'iptv_migrations',
  };
}
