export function credentialsKey(value: unknown): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('PROVIDER_CREDENTIALS_KEY requiere 32 bytes aleatorios en base64');
  const key = Buffer.from(value,'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('PROVIDER_CREDENTIALS_KEY inválida');
  return key;
}
