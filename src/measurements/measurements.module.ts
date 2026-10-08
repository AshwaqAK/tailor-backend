import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthTokenModule } from '../auth/auth-token.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { GarmentType, GarmentTypeSchema } from '../garment-types/schemas/garment-type.schema';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';
import { Measurement, MeasurementSchema } from './schemas/measurement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Measurement.name,
        schema: MeasurementSchema,
      },
      {
        name: Customer.name,
        schema: CustomerSchema,
      },
      {
        name: GarmentType.name,
        schema: GarmentTypeSchema,
      },
    ]),
    AuthTokenModule,
  ],
  controllers: [MeasurementsController],
  providers: [MeasurementsService],
  exports: [MeasurementsService],
})
export class MeasurementsModule {}
