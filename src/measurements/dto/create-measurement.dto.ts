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

export class CreateMeasurementDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^GRT-\d{6}$/, {
    message: 'garmentTypeId must be a valid garment type ID',
  })
  garmentTypeId!: string;

  @IsOptional()
  @IsEnum(ClothingType)
  clothingType?: ClothingType;

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
