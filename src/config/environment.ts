import { credentialsKey } from './credentials-key';
import { LogLevel } from '@nestjs/common';

export interface Environment {
  PROVIDER_CREDENTIALS_KEY: string;
  NODE_ENV: string; APP_NAME: string; APP_HOST: string; PORT: number;
  API_PREFIX: string; API_VERSION: string; LOG_LEVEL: LogLevel;
  DB_TYPE: 'mariadb'; DB_HOST: string; DB_PORT: number; DB_USERNAME: string;
  DB_PASSWORD: string; DB_DATABASE: string; DB_SYNCHRONIZE: false;
  DB_LOGGING: boolean; DB_SSL: boolean; DB_CONNECTION_LIMIT: number;
  TYPEORM_MIGRATIONS_RUN: false; IPTV_ORG_API_URL: string;
  IPTV_ORG_REQUEST_TIMEOUT_MS: number; IPTV_ORG_MAX_RETRIES: number;
  IPTV_SYNC_BATCH_SIZE: number; CORS_ENABLED: boolean; CORS_ORIGINS: string;
  SWAGGER_ENABLED: boolean; SWAGGER_PATH: string; HELMET_ENABLED: boolean;
  RATE_LIMIT_ENABLED: boolean; RATE_LIMIT_TTL_MS: number; RATE_LIMIT_MAX: number;
  DOCKER_HOST_PORT: number; DOCKER_DB_NETWORK: string;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result: Record<string, unknown> = {};
  const required = (key: string): string => {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Variable requerida: ${key}`);
    result[key] = value;
    return value;
  };
  credentialsKey(required('PROVIDER_CREDENTIALS_KEY'));
  const integer = (key: string, min: number, max: number) => {
    const value = required(key);
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new Error(`Número inválido: ${key}`);
    result[key] = Number(value);
  };
  const bool = (key: string) => {
    const value = required(key);
    if (!['true', 'false'].includes(value)) throw new Error(`Booleano inválido: ${key}`);
    result[key] = value === 'true';
  };
  for (const key of ['NODE_ENV','APP_NAME','APP_HOST','API_PREFIX','API_VERSION','LOG_LEVEL','DB_TYPE','DB_HOST','DB_USERNAME','DB_PASSWORD','DB_DATABASE','IPTV_ORG_API_URL','SWAGGER_PATH','DOCKER_DB_NETWORK']) required(key);
  // An empty origin list means no browser origins are authorized.
  result.CORS_ORIGINS = typeof input.CORS_ORIGINS === 'string' ? input.CORS_ORIGINS : '';
  for (const key of ['DB_SYNCHRONIZE','DB_LOGGING','DB_SSL','TYPEORM_MIGRATIONS_RUN','CORS_ENABLED','SWAGGER_ENABLED','HELMET_ENABLED','RATE_LIMIT_ENABLED']) bool(key);
  for (const key of ['PORT','DB_PORT','DOCKER_HOST_PORT']) integer(key, 1, 65535);
  integer('DB_CONNECTION_LIMIT',1,100); integer('IPTV_ORG_REQUEST_TIMEOUT_MS',100,120000);
  integer('IPTV_ORG_MAX_RETRIES',0,5); integer('IPTV_SYNC_BATCH_SIZE',1,1000);
  integer('RATE_LIMIT_TTL_MS',1000,3600000); integer('RATE_LIMIT_MAX',1,100000);
  if (result.DB_TYPE !== 'mariadb' || result.DB_DATABASE !== 'hmodevelopers_iptv') throw new Error('Solo se permite MariaDB / hmodevelopers_iptv');
  if (result.DB_SYNCHRONIZE || result.TYPEORM_MIGRATIONS_RUN) throw new Error('El esquema solo puede modificarse mediante migraciones manuales');
  if (!['development','test','production'].includes(String(result.NODE_ENV))) throw new Error('NODE_ENV inválido');
  if (!['log','error','warn','debug','verbose','fatal'].includes(String(result.LOG_LEVEL))) throw new Error('LOG_LEVEL inválido');
  if (!/^[a-zA-Z0-9/_-]+$/.test(String(result.API_PREFIX)) || !/^\d+$/.test(String(result.API_VERSION)) || !/^[a-zA-Z0-9/_-]+$/.test(String(result.SWAGGER_PATH))) throw new Error('Ruta o versión inválida');
  const url = new URL(String(result.IPTV_ORG_API_URL));
  if (url.origin !== 'https://iptv-org.github.io' || url.pathname.replace(/\/$/,'') !== '/api' || url.search || url.hash || url.username || url.password) throw new Error('IPTV_ORG_API_URL debe ser el endpoint oficial HTTPS');
  for (const origin of String(result.CORS_ORIGINS).split(',').filter(Boolean)) {
    const parsed = new URL(origin);
    if (!['http:','https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('CORS_ORIGINS requiere orígenes explícitos');
  }
  return result as unknown as Environment;
}

export function requireDatabaseCredentials(env: Environment): void {
  if ([env.DB_USERNAME,env.DB_PASSWORD].some(value => !value || value.startsWith('COLOCAR_'))) {
    throw new Error('Configura DB_USERNAME y DB_PASSWORD en .env antes de iniciar, migrar o sincronizar');
  }
}
