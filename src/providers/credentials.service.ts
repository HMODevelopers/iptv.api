import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { credentialsKey } from '../config/credentials-key';
export { credentialsKey } from '../config/credentials-key';
@Injectable()
export class CredentialsService {
  private readonly key: Buffer;
  constructor(config: ConfigService) { this.key = credentialsKey(config.get('PROVIDER_CREDENTIALS_KEY')); }
  encrypt(value: string, context: string): string {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm',this.key,iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),data.toString('base64')].join('.');
  }
  decrypt(value: string, context: string): string {
    try {
      const [version,iv,tag,data,...extra] = value.split('.');
      if (version !== 'v1' || extra.length) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm',this.key,Buffer.from(iv,'base64'));
      decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(tag,'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');
    } catch { throw new Error('No se pudo descifrar la configuración del proveedor'); }
  }
}
