import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { AppointmentStatus } from '../enums/appointment-status.enum';
import { AppointmentType } from '../enums/appointment-type.enum';

export class UpdateAppointmentDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/^ORD-\d{6}$/, {
    message: 'orderId must be a valid order ID',
  })
  orderId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Date)
  @IsDate()
  appointmentDate?: Date;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
    message: 'appointmentTime must use 24-hour HH:mm format',
  })
  appointmentTime?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
