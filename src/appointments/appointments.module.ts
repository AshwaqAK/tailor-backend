import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthTokenModule } from '../auth/auth-token.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Counter, CounterSchema } from '../users/schemas/counter.schema';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Appointment.name,
        schema: AppointmentSchema,
      },
      {
        name: Customer.name,
        schema: CustomerSchema,
      },
      {
        name: Order.name,
        schema: OrderSchema,
      },
      {
        name: Counter.name,
        schema: CounterSchema,
      },
    ]),
    AuthTokenModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
