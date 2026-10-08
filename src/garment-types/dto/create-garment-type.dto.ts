import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { CreateCustomizationGroupDto } from './create-customization-group.dto';
import { CreateMeasurementFieldDto } from './create-measurement-field.dto';
import { CreateTailoringServiceDto } from './create-tailoring-service.dto';

export class CreateGarmentTypeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be empty' })
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must contain only uppercase letters, numbers, underscores, or hyphens',
  })
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ValidateNested()
  @IsDefined()
  @Type(() => CreateTailoringServiceDto)
  tailoringService!: CreateTailoringServiceDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomizationGroupDto)
  customizationGroups!: CreateCustomizationGroupDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMeasurementFieldDto)
  measurementFields!: CreateMeasurementFieldDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
