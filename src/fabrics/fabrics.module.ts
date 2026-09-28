import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthTokenModule } from '../auth/auth-token.module';
import { Counter, CounterSchema } from '../users/schemas/counter.schema';
import { FabricsController } from './fabrics.controller';
import { FabricsService } from './fabrics.service';
import { Fabric, FabricSchema } from './schemas/fabric.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Fabric.name,
        schema: FabricSchema,
      },
      {
        name: Counter.name,
        schema: CounterSchema,
      },
    ]),
    AuthTokenModule,
  ],
  controllers: [FabricsController],
  providers: [FabricsService],
  exports: [FabricsService],
})
export class FabricsModule {}
