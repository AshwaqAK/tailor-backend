import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { Role } from '../common/constants/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CustomerReportQueryDto,
  FabricSalesReportQueryDto,
  OrderReportQueryDto,
  PaymentReportQueryDto,
  ReportDateQueryDto,
  ServiceUsageReportQueryDto,
} from './dto/report-date-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('customers')
  getCustomerReport(@Query() query: CustomerReportQueryDto) {
    return this.reportsService.getCustomerReport(query);
  }

  @Get('orders')
  getOrderReport(@Query() query: OrderReportQueryDto) {
    return this.reportsService.getOrderReport(query);
  }

  @Get('payments')
  getPaymentReport(@Query() query: PaymentReportQueryDto) {
    return this.reportsService.getPaymentReport(query);
  }

  @Get('appointments')
  getAppointmentReport(@Query() query: ReportDateQueryDto) {
    return this.reportsService.getAppointmentReport(query);
  }

  @Get('fabrics')
  getFabricReport(@Query() query: ReportDateQueryDto) {
    return this.reportsService.getFabricReport(query);
  }

  @Get('fabric-sales')
  getFabricSalesReport(@Query() query: FabricSalesReportQueryDto) {
    return this.reportsService.getFabricSalesReport(query);
  }

  @Get('services')
  getServiceReport(@Query() query: ReportDateQueryDto) {
    return this.reportsService.getServiceReport(query);
  }

  @Get('service-usage')
  getServiceUsageReport(@Query() query: ServiceUsageReportQueryDto) {
    return this.reportsService.getServiceUsageReport(query);
  }
}
