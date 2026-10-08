import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { CreateCustomizationOptionDto } from './create-customization-option.dto';

export class CreateCustomizationGroupDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be empty' })
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomizationOptionDto)
  options!: CreateCustomizationOptionDto[];
}
