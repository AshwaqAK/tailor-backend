import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Mock } from 'jest-mock';

import { Role } from '../common/constants/role.enum';
import { AuthTokenService } from './auth-token.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));

describe('AuthTokenService', () => {
  const payload = {
    sub: '507f1f77bcf86cd799439011',
    userId: 'USR-000001',
    role: Role.MANAGER,
  };
  let signAsync: Mock<(payload: unknown, options: unknown) => Promise<string>>;
  let verifyAsync: Mock<(token: string, options: unknown) => Promise<typeof payload>>;
  let getOrThrow: Mock<(key: string) => string>;
  let get: Mock<(key: string, defaultValue: string) => string>;
  let service: AuthTokenService;

  beforeEach(() => {
    signAsync = jest.fn<(payload: unknown, options: unknown) => Promise<string>>();
    verifyAsync = jest.fn<(token: string, options: unknown) => Promise<typeof payload>>();
    getOrThrow = jest.fn((key: string) => `${key}-value`);
    get = jest.fn((_key: string, defaultValue: string) => defaultValue);
    service = new AuthTokenService(
      { signAsync, verifyAsync } as unknown as JwtService,
      { getOrThrow, get } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('generates an access token with access-token configuration', async () => {
    signAsync.mockResolvedValue('access-token');

    await expect(service.generateAccessToken(payload)).resolves.toBe('access-token');
    expect(getOrThrow).toHaveBeenCalledWith('auth.jwt.accessSecret');
    expect(get).toHaveBeenCalledWith('auth.jwt.accessExpiresIn', '15m');
    expect(signAsync).toHaveBeenCalledWith(payload, {
      secret: 'auth.jwt.accessSecret-value',
      expiresIn: '15m',
    });
  });

  it('generates a refresh token with refresh-token configuration', async () => {
    signAsync.mockResolvedValue('refresh-token');

    await expect(service.generateRefreshToken(payload)).resolves.toBe('refresh-token');
    expect(getOrThrow).toHaveBeenCalledWith('auth.jwt.refreshSecret');
    expect(get).toHaveBeenCalledWith('auth.jwt.refreshExpiresIn', '7d');
    expect(signAsync).toHaveBeenCalledWith(payload, {
      secret: 'auth.jwt.refreshSecret-value',
      expiresIn: '7d',
    });
  });

  it('validates a refresh token with the refresh secret', async () => {
    verifyAsync.mockResolvedValue(payload);

    await expect(service.verifyRefreshToken('refresh-token')).resolves.toEqual(payload);
    expect(verifyAsync).toHaveBeenCalledWith('refresh-token', {
      secret: 'auth.jwt.refreshSecret-value',
    });
  });

  it('propagates invalid access-token verification errors', async () => {
    const error = new Error('invalid signature');
    verifyAsync.mockRejectedValue(error);

    await expect(service.verifyAccessToken('invalid-token')).rejects.toBe(error);
    expect(verifyAsync).toHaveBeenCalledWith('invalid-token', {
      secret: 'auth.jwt.accessSecret-value',
    });
  });
});
