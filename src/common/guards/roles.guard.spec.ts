/// <reference types="jest" />

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { JwtPayload } from '../../auth/types/jwt-payload.type';
import { Role } from '../constants/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from './access-token.guard';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let getAllAndOverride: jest.MockedFunction<Reflector['getAllAndOverride']>;
  let guard: RolesGuard;

  const createContext = (user?: JwtPayload) =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'controller',
      switchToHttp: () => ({
        getRequest: () => ({ user }) as AuthenticatedRequest,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    getAllAndOverride = jest.fn();
    guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows access when no roles are required', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      'handler',
      'controller',
    ]);
  });

  it('allows a user with a required role', () => {
    getAllAndOverride.mockReturnValue([Role.SUPER_ADMIN, Role.MANAGER]);
    const user: JwtPayload = {
      sub: 'user-object-id',
      userId: 'USR-000001',
      role: Role.MANAGER,
    };

    expect(guard.canActivate(createContext(user))).toBe(true);
  });

  it('rejects a request without an authenticated user when roles are required', () => {
    getAllAndOverride.mockReturnValue([Role.MANAGER]);

    expect(() => guard.canActivate(createContext())).toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
  });

  it('rejects a user whose role is not permitted', () => {
    getAllAndOverride.mockReturnValue([Role.SUPER_ADMIN, Role.MANAGER]);
    const user: JwtPayload = {
      sub: 'user-object-id',
      userId: 'USR-000002',
      role: Role.TAILOR,
    };

    expect(() => guard.canActivate(createContext(user))).toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
  });
});
