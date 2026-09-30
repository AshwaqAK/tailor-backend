import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

export function parsePaymentQueryDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return new Date(value);
  }

  return new Date(`${value}Z`);
}

@ValidatorConstraint({ name: 'paymentDateRange', async: false })
export class PaymentDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: string | undefined, args: ValidationArguments): boolean {
    const query = args.object as PaymentQueryDto;

    if (!query.fromDate || !query.toDate) {
      return true;
    }

    const fromTime = parsePaymentQueryDate(query.fromDate).getTime();
    const toDate = parsePaymentQueryDate(query.toDate);
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(query.toDate);

    if (isDateOnly) {
      toDate.setUTCDate(toDate.getUTCDate() + 1);
    }

    const toTime = toDate.getTime();

    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
      return true;
    }

    return isDateOnly ? fromTime < toTime : fromTime <= toTime;
  }

  defaultMessage(): string {
    return 'fromDate must be earlier than or equal to toDate';
  }
}

export class PaymentQueryDto {
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
  @Matches(/^ORD-\d{6}$/, {
    message: 'orderId must be a valid order ID',
  })
  orderId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.+)?$/, {
    message: 'fromDate must be a complete ISO date or date-time',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'fromDate must be a valid ISO date' },
  )
  fromDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.+)?$/, {
    message: 'toDate must be a complete ISO date or date-time',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'toDate must be a valid ISO date' },
  )
  @Validate(PaymentDateRangeConstraint)
  toDate?: string;

  @IsOptional()
  @IsIn(['paidAt', 'amount', 'status', 'createdAt'])
  sortBy: 'paidAt' | 'amount' | 'status' | 'createdAt' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
