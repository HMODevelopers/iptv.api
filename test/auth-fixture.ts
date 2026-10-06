import { randomBytes } from 'node:crypto';
export function authTestEnvironment() {
  return { JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    ARGON2_MEMORY_KIB: 19456, ARGON2_TIME_COST: 2, AUTH_LOGIN_LIMIT: 100, AUTH_MAX_LOGIN_ATTEMPTS: 3 };
}
