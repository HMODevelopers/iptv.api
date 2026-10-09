import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PageQuery } from '../channels/dto/query.dto';
import { HealthRunStatus, HealthTrigger, StreamStatus } from '../database/entities';
export class HealthQuery {
  @IsOptional() @IsEnum(StreamStatus) status?: StreamStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) providerId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) channelId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) streamId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(525600) staleMinutes?: number;
  @IsOptional() @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() force = false;
}
export class HealthRunsQuery extends PageQuery {
  @IsOptional() @IsEnum(HealthRunStatus) status?: HealthRunStatus;
  @IsOptional() @IsEnum(HealthTrigger) triggerType?: HealthTrigger;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) startedBy?: number;
}
export class CandidatesQuery {
  @IsOptional() @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() includeOffline = false;
}
