import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from './types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const { accessToken, refreshToken } = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );

    this.setRefreshTokenCookie(response, refreshToken);

    return {
      accessToken,
    };
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cookieName = this.configService.getOrThrow<string>('auth.cookie.name');

    const refreshToken: unknown = request.cookies[cookieName];

    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const result = await this.authService.refresh(refreshToken);

    this.setRefreshTokenCookie(response, result.refreshToken);

    return {
      accessToken: result.accessToken,
    };
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string): void {
    const cookieName = this.configService.getOrThrow<string>('auth.cookie.name');

    const secure = this.configService.get<boolean>('auth.cookie.secure', false);

    const sameSite = this.configService.get<string>('auth.cookie.sameSite', 'lax');

    response.cookie(cookieName, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: sameSite as 'lax' | 'strict' | 'none',
      path: '/api/v1/auth',
    });
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async me(@CurrentUser() user: JwtPayload) {
    return this.authService.getAuthenticatedUser(user.sub);
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  async logout(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(user.sub);

    this.clearRefreshTokenCookie(response);

    return {
      message: 'Logged out successfully',
    };
  }

  private clearRefreshTokenCookie(response: Response): void {
    const cookieName = this.configService.getOrThrow<string>('auth.cookie.name');

    response.clearCookie(cookieName, {
      httpOnly: true,
      path: '/api/v1/auth',
    });
  }
}
