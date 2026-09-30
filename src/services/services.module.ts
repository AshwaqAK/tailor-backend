import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthTokenModule } from '../auth/auth-token.module';
import { Counter, CounterSchema } from '../users/schemas/counter.schema';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { TailoringService, TailoringServiceSchema } from './schemas/tailoring-service.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: TailoringService.name,
        schema: TailoringServiceSchema,
      },
      {
        name: Counter.name,
        schema: CounterSchema,
      },
    ]),
    AuthTokenModule,
  ],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
