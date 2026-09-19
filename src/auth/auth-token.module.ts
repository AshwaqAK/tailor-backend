import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { AuthTokenService } from './auth-token.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthTokenService, AccessTokenGuard],
  exports: [AuthTokenService, AccessTokenGuard],
})
export class AuthTokenModule { }