import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';

import { ClothingType } from '../enums/clothing-type.enum';
import { FitPreference } from '../enums/fit-preference.enum';
import { MeasurementValuesConstraint } from './measurement-values.validator';

export class CreateMeasurementDto {
  @IsMongoId()
  customerId!: string;

  @IsEnum(ClothingType)
  clothingType!: ClothingType;

  @IsInt()
  @Min(1)
  version!: number;

  @IsObject()
  @Validate(MeasurementValuesConstraint)
  measurements!: Record<string, number>;

  @IsOptional()
  @IsEnum(FitPreference)
  fitPreference?: FitPreference;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @Type(() => Date)
  @IsDate()
  measuredAt!: Date;
}
