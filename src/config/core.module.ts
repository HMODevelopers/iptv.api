import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Environment, validateEnvironment } from './environment';
import { databaseOptions } from '../database/options';
@Module({ imports: [
  ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
  TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService<Environment,true>) => {
    const env = {} as Environment;
    // ConfigService stores validated values in its internal configuration.
    for (const key of Object.keys(validateEnvironment(process.env)) as (keyof Environment)[]) {
      Object.assign(env, { [key]: config.get(key, { infer: true }) });
    }
    return { ...databaseOptions(env), retryAttempts: 1 };
  } }),
] })
export class CoreModule {}
