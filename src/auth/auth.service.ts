import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { AuthTokenService } from './auth-token.service';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  private readonly refreshTokenSaltRounds = 12;

  constructor(
    private readonly usersService: UsersService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await this.usersService.findByEmailWithPassword(email);

    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await this.usersService.comparePassword(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user._id.toString(),
      userId: user.userId,
      role: user.role,
    };

    const accessToken = await this.authTokenService.generateAccessToken(payload);

    const refreshToken = await this.authTokenService.generateRefreshToken(payload);

    const refreshTokenHash = await bcrypt.hash(refreshToken, this.refreshTokenSaltRounds);

    await this.usersService.updateRefreshTokenHash(user._id.toString(), refreshTokenHash);

    await this.usersService.updateLastLoginAt(user._id.toString());

    return {
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    let payload: JwtPayload;

    try {
      payload = await this.authTokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findByIdWithRefreshToken(payload.sub);

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenMatches = await bcrypt.compare(refreshToken, user.refreshTokenHash);

    if (!tokenMatches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newPayload = {
      sub: user._id.toString(),
      userId: user.userId,
      role: user.role,
    };

    const accessToken = await this.authTokenService.generateAccessToken(newPayload);

    const newRefreshToken = await this.authTokenService.generateRefreshToken(newPayload);

    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, this.refreshTokenSaltRounds);

    await this.usersService.updateRefreshTokenHash(user._id.toString(), newRefreshTokenHash);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.clearRefreshTokenHash(userId);
  }

  async getAuthenticatedUser(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return this.usersService.toUserResponse(user);
  }
}
