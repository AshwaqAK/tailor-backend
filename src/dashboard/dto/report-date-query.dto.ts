import {
  IsDateString,
  IsEnum,
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
import { Type } from 'class-transformer';

import { PaymentMethod } from '../../payments/enums/payment-method.enum';

export function parseReportDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return new Date(value);
  }

  return new Date(`${value}Z`);
}

@ValidatorConstraint({ name: 'reportDateRange', async: false })
export class ReportDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: string | undefined, args: ValidationArguments): boolean {
    const query = args.object as ReportDateQueryDto;

    if (!query.fromDate || !query.toDate) {
      return true;
    }

    const fromTime = parseReportDate(query.fromDate).getTime();
    const toDate = parseReportDate(query.toDate);

    if (/^\d{4}-\d{2}-\d{2}$/.test(query.toDate)) {
      toDate.setUTCDate(toDate.getUTCDate() + 1);
    }

    const toTime = toDate.getTime();

    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
      return true;
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(query.toDate) ? fromTime < toTime : fromTime <= toTime;
  }

  defaultMessage(): string {
    return 'fromDate must be earlier than or equal to toDate';
  }
}

export class ReportDateQueryDto {
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
  @Validate(ReportDateRangeConstraint)
  toDate?: string;
}

export class OrderReportQueryDto extends ReportDateQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId?: string;
}

export class PaymentReportQueryDto extends ReportDateQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}

export class CustomerReportQueryDto extends ReportDateQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^CUS-\d{6}$/, {
    message: 'customerId must be a valid customer ID',
  })
  customerId?: string;

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
}

export class FabricSalesReportQueryDto extends ReportDateQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^FAB-\d{6}$/, {
    message: 'fabricId must be a valid fabric ID',
  })
  fabricId?: string;

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
}

export class ServiceUsageReportQueryDto extends ReportDateQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^SRV-\d{6}$/, {
    message: 'serviceId must be a valid service ID',
  })
  serviceId?: string;

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
}
