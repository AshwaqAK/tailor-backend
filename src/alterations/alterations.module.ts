import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthTokenModule } from '../auth/auth-token.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Counter, CounterSchema } from '../users/schemas/counter.schema';
import { OrderItem, OrderItemSchema } from '../orders/schemas/order-item.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { AlterationsController } from './alterations.controller';
import { AlterationsService } from './alterations.service';
import { Alteration, AlterationSchema } from './schemas/alteration.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Alteration.name, schema: AlterationSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    AuthTokenModule,
    AuditLogsModule,
  ],
  controllers: [AlterationsController],
  providers: [AlterationsService],
  exports: [AlterationsService],
})
export class AlterationsModule {}
