import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { Counter, CounterSchema } from './schemas/counter.schema';
import { UsersController } from './users.controller';
import { AuthTokenModule } from '../auth/auth-token.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: Counter.name,
        schema: CounterSchema,
      },
    ]),
    AuthTokenModule
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
