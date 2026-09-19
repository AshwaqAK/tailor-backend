import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';

import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateAccessToken(payload: JwtPayload): Promise<string> {
    const secret = this.configService.getOrThrow<string>('auth.jwt.accessSecret');

    const expiresIn = this.configService.get<string>(
      'auth.jwt.accessExpiresIn',
      '15m',
    ) as StringValue;

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
    });
  }

  async generateRefreshToken(payload: JwtPayload): Promise<string> {
    const secret = this.configService.getOrThrow<string>('auth.jwt.refreshSecret');

    const expiresIn = this.configService.get<string>(
      'auth.jwt.refreshExpiresIn',
      '7d',
    ) as StringValue;

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
    });
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const secret = this.configService.getOrThrow<string>('auth.jwt.accessSecret');

    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret,
    });
  }

  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    const secret = this.configService.getOrThrow<string>('auth.jwt.refreshSecret');

    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret,
    });
  }
}
