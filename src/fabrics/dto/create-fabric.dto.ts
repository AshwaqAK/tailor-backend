import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { FabricType } from '../enums/fabric-type.enum';
import { QuantityUnit } from '../enums/quantity-unit.enum';

export class CreateFabricDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be empty' })
  @MaxLength(100)
  name!: string;

  @IsEnum(FabricType)
  type!: FabricType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  color!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity!: number;

  @IsEnum(QuantityUnit)
  unit!: QuantityUnit;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerUnit!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
