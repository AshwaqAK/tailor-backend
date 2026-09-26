import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { AppointmentStatus } from '../enums/appointment-status.enum';
import { AppointmentType } from '../enums/appointment-type.enum';

export class AppointmentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^ORD-\d{6}$/, {
    message: 'orderId must be a valid order ID',
  })
  orderId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  appointmentDate?: Date;

  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsIn(['appointmentDate', 'appointmentTime', 'status', 'createdAt'])
  sortBy: 'appointmentDate' | 'appointmentTime' | 'status' | 'createdAt' = 'appointmentDate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
