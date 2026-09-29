/// <reference types="jest" />

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import type { AuthTokenService } from '../../auth/auth-token.service';
import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { Role } from '../constants/role.enum';
import { AccessTokenGuard, AuthenticatedRequest } from './access-token.guard';

jest.mock('../../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));

describe('AccessTokenGuard', () => {
  let verifyAccessToken: jest.MockedFunction<AuthTokenService['verifyAccessToken']>;
  let guard: AccessTokenGuard;

  const createContext = (authorization?: string) => {
    const request = {
      headers: authorization === undefined ? {} : { authorization },
    } as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    return { context, request };
  };

  beforeEach(() => {
    verifyAccessToken = jest.fn();
    guard = new AccessTokenGuard({ verifyAccessToken } as unknown as AuthTokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests without an authorization header', async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Authentication required'),
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects authorization headers that are not Bearer tokens', async () => {
    const { context } = createContext('Basic credentials');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid authorization header'),
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a Bearer header without a token', async () => {
    const { context } = createContext('Bearer ');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid authorization header'),
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('verifies the token and attaches its payload to the request', async () => {
    const payload: JwtPayload = {
      sub: 'user-object-id',
      userId: 'USR-000001',
      role: Role.MANAGER,
    };
    verifyAccessToken.mockResolvedValue(payload);
    const { context, request } = createContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(request.user).toBe(payload);
  });

  it('returns the standard unauthorized exception for an invalid JWT', async () => {
    verifyAccessToken.mockRejectedValue(new Error('invalid signature'));
    const { context, request } = createContext('Bearer invalid-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired access token'),
    );
    expect(request.user).toBeUndefined();
  });

  it('returns the standard unauthorized exception for an expired JWT', async () => {
    const expiredError = new Error('jwt expired');
    expiredError.name = 'TokenExpiredError';
    verifyAccessToken.mockRejectedValue(expiredError);
    const { context, request } = createContext('Bearer expired-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired access token'),
    );
    expect(request.user).toBeUndefined();
  });
});
