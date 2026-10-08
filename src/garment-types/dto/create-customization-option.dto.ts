import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { InputType } from '../enums/input-type.enum';
import { PricingType } from '../enums/pricing-type.enum';

export class CreateCustomizationOptionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be empty' })
  @MaxLength(100)
  name!: string;

  @IsEnum(InputType)
  inputType!: InputType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsEnum(PricingType)
  pricingType!: PricingType;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
