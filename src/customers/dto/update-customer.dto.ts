import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { Gender } from '../enums/gender.enum';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{10}$/, {
    message: 'phone must be a valid 10-digit phone number',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'alternatePhone must be a valid 10-digit phone number',
  })
  alternatePhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
