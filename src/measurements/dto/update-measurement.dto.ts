import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';

import { ClothingType } from '../enums/clothing-type.enum';
import { FitPreference } from '../enums/fit-preference.enum';
import { MeasurementValuesConstraint } from './measurement-values.validator';

export class UpdateMeasurementDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  @IsOptional()
  @IsEnum(ClothingType)
  clothingType?: ClothingType;

  @IsOptional()
  @IsString()
  @Matches(/^GRT-\d{6}$/, {
    message: 'garmentTypeId must be a valid garment type ID',
  })
  garmentTypeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsObject()
  @Validate(MeasurementValuesConstraint)
  measurements?: Record<string, number>;

  @IsOptional()
  @IsEnum(FitPreference)
  fitPreference?: FitPreference;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  measuredAt?: Date;
}
