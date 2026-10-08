import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { MeasurementUnit } from '../enums/measurement-unit.enum';

export class CreateMeasurementFieldDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message: 'key must contain only letters, numbers, or underscores and start with a letter',
  })
  @MaxLength(100)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be empty' })
  @MaxLength(100)
  name!: string;

  @IsEnum(MeasurementUnit)
  unit!: MeasurementUnit;

  @IsBoolean()
  required!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
