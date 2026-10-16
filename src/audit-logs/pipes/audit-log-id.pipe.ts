import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class AuditLogIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^AUD-\d{6}$/.test(value)) {
      throw new BadRequestException('auditLogId must be a valid audit log ID');
    }
    return value;
  }
}
