import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { validateEnvironment, requireDatabaseCredentials } from '../src/config/environment';
import { databaseOptions } from '../src/database/options';
const sample = () => parse(readFileSync('.env.example'));
describe('Configuración', () => {
  it('documenta todas las variables y prohíbe conectar con marcadores', () => {
    const env = validateEnvironment(sample());
    expect(env.PORT).toBe(3000);
    expect(() => requireDatabaseCredentials(env)).toThrow('Configura');
  });
  it.each([{ DB_DATABASE: 'other' }, { DB_SYNCHRONIZE: 'true' }, { TYPEORM_MIGRATIONS_RUN: 'true' }, { PORT: 'abc' }, { DB_SSL: 'yes' }, { IPTV_ORG_API_URL: 'http://127.0.0.1/api' }, { CORS_ORIGINS: '*' }])('rechaza configuración insegura %j', values => {
    expect(() => validateEnvironment({ ...sample(), ...values })).toThrow();
  });
  it('mantiene migraciones manuales y driver MariaDB', () => {
    const options = databaseOptions(validateEnvironment({ ...sample(), DB_USERNAME: 'example', DB_PASSWORD: 'example' }));
    expect(options).toMatchObject({ type: 'mariadb', database: 'hmodevelopers_iptv', synchronize: false, migrationsRun: false });
  });
});
