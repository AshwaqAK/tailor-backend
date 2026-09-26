import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { AppointmentType } from '../enums/appointment-type.enum';

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^ORD-\d{6}$/, {
    message: 'orderId must be a valid order ID',
  })
  orderId?: string;

  @Type(() => Date)
  @IsDate()
  appointmentDate!: Date;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
    message: 'appointmentTime must use 24-hour HH:mm format',
  })
  appointmentTime!: string;

  @IsEnum(AppointmentType)
  type!: AppointmentType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
