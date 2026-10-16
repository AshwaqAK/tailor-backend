import { Type } from 'class-transformer';
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

import { AuditAction } from '../enums/audit-action.enum';
import { AuditEntityType } from '../enums/audit-entity-type.enum';

export function parseAuditLogDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
}

@ValidatorConstraint({ name: 'auditLogDateRange', async: false })
export class AuditLogDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: string | undefined, args: ValidationArguments): boolean {
    const query = args.object as AuditLogQueryDto;

    if (!query.fromDate || !query.toDate) return true;

    const fromTime = parseAuditLogDate(query.fromDate).getTime();
    const toDate = parseAuditLogDate(query.toDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.toDate)) {
      toDate.setUTCDate(toDate.getUTCDate() + 1);
    }

    return !Number.isNaN(fromTime) && !Number.isNaN(toDate.getTime()) && fromTime <= toDate.getTime();
  }

  defaultMessage(): string {
    return 'fromDate must be earlier than or equal to toDate';
  }
}

export class AuditLogQueryDto {
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
  @Matches(/^USR-\d{6}$/, { message: 'actorId must be a valid user ID' })
  actorId?: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/, {
    message: 'entityId must be a valid entity identifier',
  })
  entityId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.+)?$/)
  @IsDateString({ strict: true, strictSeparator: true })
  fromDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.+)?$/)
  @IsDateString({ strict: true, strictSeparator: true })
  @Validate(AuditLogDateRangeConstraint)
  toDate?: string;
}
