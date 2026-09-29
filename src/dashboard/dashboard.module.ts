import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Appointment, AppointmentSchema } from '../appointments/schemas/appointment.schema';
import { AuthTokenModule } from '../auth/auth-token.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Fabric, FabricSchema } from '../fabrics/schemas/fabric.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  TailoringService,
  TailoringServiceSchema,
} from '../services/schemas/tailoring-service.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Fabric.name, schema: FabricSchema },
      { name: TailoringService.name, schema: TailoringServiceSchema },
    ]),
    AuthTokenModule,
  ],
  controllers: [DashboardController, ReportsController],
  providers: [DashboardService, ReportsService],
})
export class DashboardModule {}
