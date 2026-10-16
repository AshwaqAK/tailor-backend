import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { Role } from '../common/constants/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogIdPipe } from './pipes/audit-log-id.pipe';

@Controller('audit-logs')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogsService.findAll(query);
  }

  @Get(':auditLogId')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  findOne(@Param('auditLogId', AuditLogIdPipe) auditLogId: string) {
    return this.auditLogsService.findOne(auditLogId);
  }
}
