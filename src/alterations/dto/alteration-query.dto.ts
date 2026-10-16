import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { AlterationStatus } from '../enums/alteration-status.enum';

export class AlterationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId?: string;

  @IsOptional()
  @Matches(/^ORD-\d{6}$/, {
    message: 'orderId must be a valid order ID',
  })
  orderId?: string;

  @IsOptional()
  @IsEnum(AlterationStatus)
  status?: AlterationStatus;

  @IsOptional()
  @IsIn(['requestDate', 'status', 'createdAt'])
  sortBy: 'requestDate' | 'status' | 'createdAt' = 'requestDate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
