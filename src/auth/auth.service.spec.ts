/// <reference types="jest" />

import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { UsersService } from '../users/users.service';
import { Role } from '../common/constants/role.enum';
import type { AuthTokenService } from './auth-token.service';
import { AuthService } from './auth.service';

jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));
jest.mock('./auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const payload = {
    sub: userId,
    userId: 'USR-000001',
    role: Role.MANAGER,
  };
  const activeUser = {
    _id: { toString: () => userId },
    userId: payload.userId,
    role: payload.role,
    isActive: true,
    passwordHash: 'stored-password-hash',
    refreshTokenHash: 'stored-refresh-hash',
  };

  let usersService: {
    findByEmailWithPassword: jest.Mock;
    comparePassword: jest.Mock;
    updateRefreshTokenHash: jest.Mock;
    updateLastLoginAt: jest.Mock;
    findByIdWithRefreshToken: jest.Mock;
    clearRefreshTokenHash: jest.Mock;
    findById: jest.Mock;
    toUserResponse: jest.Mock;
  };
  let authTokenService: {
    generateAccessToken: jest.Mock;
    generateRefreshToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
  };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmailWithPassword: jest.fn(),
      comparePassword: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      updateLastLoginAt: jest.fn(),
      findByIdWithRefreshToken: jest.fn(),
      clearRefreshTokenHash: jest.fn(),
      findById: jest.fn(),
      toUserResponse: jest.fn(),
    };
    authTokenService = {
      generateAccessToken: jest.fn(),
      generateRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    };
    service = new AuthService(
      usersService as unknown as UsersService,
      authTokenService as unknown as AuthTokenService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('logs in an active user and rotates the stored refresh-token hash', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(activeUser);
    usersService.comparePassword.mockResolvedValue(true);
    authTokenService.generateAccessToken.mockResolvedValue('access-token');
    authTokenService.generateRefreshToken.mockResolvedValue('refresh-token');
    jest.mocked(bcrypt.hash).mockResolvedValue('hashed-refresh-token' as never);

    await expect(service.login('USER@EXAMPLE.COM', 'ValidPassword1!')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(usersService.findByEmailWithPassword).toHaveBeenCalledWith('USER@EXAMPLE.COM');
    expect(usersService.comparePassword).toHaveBeenCalledWith(
      'ValidPassword1!',
      'stored-password-hash',
    );
    expect(authTokenService.generateAccessToken).toHaveBeenCalledWith(payload);
    expect(authTokenService.generateRefreshToken).toHaveBeenCalledWith(payload);
    expect(bcrypt.hash).toHaveBeenCalledWith('refresh-token', 12);
    expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
      userId,
      'hashed-refresh-token',
    );
    expect(usersService.updateLastLoginAt).toHaveBeenCalledWith(userId);
  });

  it('rejects an unknown email without comparing a password', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(null);

    await expect(service.login('missing@example.com', 'Password1!')).rejects.toThrow(
      new UnauthorizedException('Invalid credentials'),
    );
    expect(usersService.comparePassword).not.toHaveBeenCalled();
  });

  it('rejects an invalid password without generating tokens', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(activeUser);
    usersService.comparePassword.mockResolvedValue(false);

    await expect(service.login('user@example.com', 'WrongPassword1!')).rejects.toThrow(
      new UnauthorizedException('Invalid credentials'),
    );
    expect(authTokenService.generateAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an inactive user before comparing a password', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });

    await expect(service.login('user@example.com', 'ValidPassword1!')).rejects.toThrow(
      new UnauthorizedException('Invalid credentials'),
    );
    expect(usersService.comparePassword).not.toHaveBeenCalled();
  });

  it('validates and rotates a refresh token', async () => {
    authTokenService.verifyRefreshToken.mockResolvedValue(payload);
    usersService.findByIdWithRefreshToken.mockResolvedValue(activeUser);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    authTokenService.generateAccessToken.mockResolvedValue('new-access-token');
    authTokenService.generateRefreshToken.mockResolvedValue('new-refresh-token');
    jest.mocked(bcrypt.hash).mockResolvedValue('new-refresh-hash' as never);

    await expect(service.refresh('refresh-token')).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(authTokenService.verifyRefreshToken).toHaveBeenCalledWith('refresh-token');
    expect(bcrypt.compare).toHaveBeenCalledWith('refresh-token', 'stored-refresh-hash');
    expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
      userId,
      'new-refresh-hash',
    );
  });

  it('rejects an invalid or expired signed refresh token', async () => {
    authTokenService.verifyRefreshToken.mockRejectedValue(new Error('jwt expired'));

    await expect(service.refresh('expired-token')).rejects.toThrow(
      new UnauthorizedException('Invalid refresh token'),
    );
    expect(usersService.findByIdWithRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects a refresh token that does not match the stored hash', async () => {
    authTokenService.verifyRefreshToken.mockResolvedValue(payload);
    usersService.findByIdWithRefreshToken.mockResolvedValue(activeUser);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(service.refresh('replayed-token')).rejects.toThrow(
      new UnauthorizedException('Invalid refresh token'),
    );
    expect(authTokenService.generateAccessToken).not.toHaveBeenCalled();
  });

  it('rejects refresh for an inactive user', async () => {
    authTokenService.verifyRefreshToken.mockResolvedValue(payload);
    usersService.findByIdWithRefreshToken.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });

    await expect(service.refresh('refresh-token')).rejects.toThrow(
      new UnauthorizedException('Invalid refresh token'),
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('invalidates the stored refresh token on logout', async () => {
    await service.logout(userId);

    expect(usersService.clearRefreshTokenHash).toHaveBeenCalledWith(userId);
  });

  it('rejects an inactive authenticated user', async () => {
    usersService.findById.mockResolvedValue({ ...activeUser, isActive: false });

    await expect(service.getAuthenticatedUser(userId)).rejects.toThrow(
      new UnauthorizedException('User account is inactive'),
    );
    expect(usersService.toUserResponse).not.toHaveBeenCalled();
  });
});
