import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthTokenModule } from '../auth/auth-token.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { FabricsModule } from '../fabrics/fabrics.module';
import { GarmentType, GarmentTypeSchema } from '../garment-types/schemas/garment-type.schema';
import { GarmentTypesModule } from '../garment-types/garment-types.module';
import { Measurement, MeasurementSchema } from '../measurements/schemas/measurement.schema';
import { ServicesModule } from '../services/services.module';
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
      {
        name: GarmentType.name,
        schema: GarmentTypeSchema,
      },
    ]),
    AuthTokenModule,
    FabricsModule,
    GarmentTypesModule,
    ServicesModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
