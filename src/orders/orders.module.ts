import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthTokenModule } from '../auth/auth-token.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Measurement, MeasurementSchema } from '../measurements/schemas/measurement.schema';
import { Counter, CounterSchema } from '../users/schemas/counter.schema';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderItem, OrderItemSchema } from './schemas/order-item.schema';
import { Order, OrderSchema } from './schemas/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Order.name,
        schema: OrderSchema,
      },
      {
        name: OrderItem.name,
        schema: OrderItemSchema,
      },
      {
        name: Customer.name,
        schema: CustomerSchema,
      },
      {
        name: Measurement.name,
        schema: MeasurementSchema,
      },
      {
        name: Counter.name,
        schema: CounterSchema,
      },
    ]),
    AuthTokenModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
