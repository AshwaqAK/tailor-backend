import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthTokenModule } from '../auth/auth-token.module';
import { Counter, CounterSchema } from '../users/schemas/counter.schema';
import { GarmentTypesController } from './garment-types.controller';
import { GarmentTypesService } from './garment-types.service';
import { GarmentTypePricingService } from './garment-type-pricing.service';
import { GarmentType, GarmentTypeSchema } from './schemas/garment-type.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GarmentType.name, schema: GarmentTypeSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    AuthTokenModule,
  ],
  controllers: [GarmentTypesController],
  providers: [GarmentTypesService, GarmentTypePricingService],
  exports: [GarmentTypesService, GarmentTypePricingService],
})
export class GarmentTypesModule {}
