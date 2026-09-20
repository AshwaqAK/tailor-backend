import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerCounter, CustomerCounterSchema } from './schemas/customer-counter.schema';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { AuthTokenModule } from '../auth/auth-token.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Customer.name,
        schema: CustomerSchema,
      },
      {
        name: CustomerCounter.name,
        schema: CustomerCounterSchema,
      },
    ]),
    AuthTokenModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
