import { Public } from '../security/guards';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiProperty, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Environment } from '../config/environment';
export class HealthResponse {
  @ApiProperty() status!: string;
  @ApiProperty() application!: string;
  @ApiProperty() version!: string;
  @ApiProperty() database!: string;
}
@ApiTags('Sistema') @Controller('health')
class HealthController {
  constructor(private readonly db: DataSource, private readonly config: ConfigService<Environment,true>) {}
  @Public() @Get() @ApiOkResponse({ type: HealthResponse }) @ApiServiceUnavailableResponse({ description: 'MariaDB no disponible' })
  async health() {
    try { await this.db.query('SELECT 1'); }
    catch { throw new ServiceUnavailableException('Base de datos no disponible'); }
    return { status: 'ok', application: this.config.get('APP_NAME'), version: this.config.get('API_VERSION'), database: 'ok' };
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
