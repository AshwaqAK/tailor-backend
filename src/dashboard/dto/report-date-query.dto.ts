import {
  IsDateString,
  IsOptional,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

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

    return /^\d{4}-\d{2}-\d{2}$/.test(query.toDate)
      ? fromTime < toTime
      : fromTime <= toTime;
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
