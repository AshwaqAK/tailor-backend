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

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:\+91[\s-]?)?[6-9]\d{9}$/, {
    message: 'phone must be a valid Indian 10-digit mobile number',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:\+91[\s-]?)?[6-9]\d{9}$/, {
    message: 'alternatePhone must be a valid Indian 10-digit mobile number',
  })
  alternatePhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender!: Gender;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
