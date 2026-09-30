import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { FabricType } from '../enums/fabric-type.enum';
import { QuantityUnit } from '../enums/quantity-unit.enum';
import { transformBooleanQuery } from '../../common/transforms/boolean-query.transform';

export class FabricQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(FabricType)
  type?: FabricType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  color?: string;

  @IsOptional()
  @IsEnum(QuantityUnit)
  unit?: QuantityUnit;

  @IsOptional()
  @Transform(transformBooleanQuery)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['fabricId', 'name', 'type', 'color', 'quantity', 'pricePerUnit', 'createdAt'])
  sortBy: 'fabricId' | 'name' | 'type' | 'color' | 'quantity' | 'pricePerUnit' | 'createdAt' =
    'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
