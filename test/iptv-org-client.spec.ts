import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { IptvOrgClient } from '../src/providers/iptv-org/iptv-org.client';
import { Environment, validateEnvironment } from '../src/config/environment';
function createClient(retries = 0) {
  const http = { get: jest.fn() };
  const env = validateEnvironment({ ...parse(readFileSync('.env.example')), IPTV_ORG_MAX_RETRIES: String(retries) });
  const client = new IptvOrgClient(http as unknown as HttpService, new ConfigService(env) as ConfigService<Environment,true>);
  return { client, http };
}
describe('Cliente IPTV-org', () => {
  it('obtiene seis catálogos con timeout, sin proxy ni redirecciones', async () => {
    const { client,http } = createClient(); http.get.mockReturnValue(of({ data: [] }));
    const result = await client.fetchSnapshot();
    expect(Object.keys(result)).toHaveLength(6);
    expect(http.get).toHaveBeenCalledWith('https://iptv-org.github.io/api/blocklist.json',expect.objectContaining({ timeout: 15000, maxRedirects: 0, proxy: false }));
  });
  it('reintenta errores y aborta sin exponer URLs ni credenciales', async () => {
    jest.useFakeTimers();
    try {
      const { client,http } = createClient(1);
      http.get.mockReturnValue(throwError(() => new Error('secret-password')));
      const promise = expect(client.fetchSnapshot()).rejects.toThrow('No se pudo obtener channels');
      await jest.runAllTimersAsync(); await promise;
      expect(http.get).toHaveBeenCalledTimes(2);
    } finally { jest.useRealTimers(); }
  });
  it('rechaza respuestas que no son arreglos', async () => {
    const { client,http } = createClient(); http.get.mockReturnValue(of({ data: { error: true } }));
    await expect(client.fetchSnapshot()).rejects.toThrow('No se pudo obtener channels');
  });
});
