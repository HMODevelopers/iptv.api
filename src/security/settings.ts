import { ConfigService } from '@nestjs/config';
export interface SecuritySettings {
  accessSecret: string; refreshSecret: string; accessSeconds: number; refreshSeconds: number;
  memoryCost: number; timeCost: number; parallelism: number; maxAttempts: number;
  lockSeconds: number; maxSessions: number; loginLimit: number; loginWindowMs: number;
}
export function securitySettings(config: ConfigService): SecuritySettings {
  const secret = (key: string) => {
    const value = config.get<string>(key) ?? '';
    if (value.length < 48 || /COLOCAR_|CHANGE_|REPLACE_|example/i.test(value) || new Set(value).size < 12) {
      throw new Error(`${key} debe contener al menos 48 caracteres de un secreto aleatorio configurado localmente`);
    }
    return value;
  };
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(config.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Configuración inválida: ${key}`);
    return value;
  };
  const accessSecret = secret('JWT_ACCESS_SECRET'); const refreshSecret = secret('JWT_REFRESH_SECRET');
  if (accessSecret === refreshSecret) throw new Error('Los secretos JWT deben ser diferentes');
  return { accessSecret, refreshSecret,
    accessSeconds: number('JWT_ACCESS_TTL_SECONDS',900,60,3600), refreshSeconds: number('JWT_REFRESH_TTL_SECONDS',604800,3600,2592000),
    memoryCost: number('ARGON2_MEMORY_KIB',65536,19456,262144), timeCost: number('ARGON2_TIME_COST',3,2,10), parallelism: number('ARGON2_PARALLELISM',1,1,4),
    maxAttempts: number('AUTH_MAX_LOGIN_ATTEMPTS',5,1,20), lockSeconds: number('AUTH_LOCK_SECONDS',900,30,86400),
    maxSessions: number('AUTH_MAX_SESSIONS',10,1,100), loginLimit: number('AUTH_LOGIN_LIMIT',10,1,100), loginWindowMs: number('AUTH_LOGIN_WINDOW_MS',60000,1000,3600000),
  };
}
