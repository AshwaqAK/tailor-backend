import { Controller, Get, UseGuards } from '@nestjs/common';

import { Role } from '../common/constants/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AccessTokenGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Roles(Role.SUPER_ADMIN, Role.MANAGER)
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
