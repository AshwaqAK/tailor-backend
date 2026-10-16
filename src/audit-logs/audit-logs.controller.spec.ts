import 'reflect-metadata';

import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('./audit-logs.service', () => ({
  AuditLogsService: class AuditLogsService {},
}));

import { AuthTokenService } from '../auth/auth-token.service';
import { Role } from '../common/constants/role.enum';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditAction } from './enums/audit-action.enum';
import { AuditLogsController } from './audit-logs.controller';

describe('AuditLogsController', () => {
  const service = { findAll: jest.fn(), findOne: jest.fn() };
  const controller = new AuditLogsController(service as never);

  it('exposes only read operations and delegates supported endpoints', async () => {
    const query = { page: 1, limit: 20, action: AuditAction.CREATED };
    await controller.findAll(query);
    await controller.findOne('AUD-000001');

    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(service.findOne).toHaveBeenCalledWith('AUD-000001');
    expect(Object.getOwnPropertyNames(AuditLogsController.prototype)).not.toEqual(
      expect.arrayContaining(['create', 'update', 'remove', 'delete']),
    );
  });

  it('requires authentication and restricts access to managers and super admins', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AuditLogsController)).toEqual([
      AccessTokenGuard,
      RolesGuard,
    ]);

    const roles = Reflect.getMetadata(
      ROLES_KEY,
      Object.getOwnPropertyDescriptor(AuditLogsController.prototype, 'findAll')?.value,
    ) as Role[];
    expect(roles).toEqual([Role.SUPER_ADMIN, Role.MANAGER]);
  });

  it('rejects unauthenticated and disallowed-role access using existing guards', async () => {
    const tokenGuard = new AccessTokenGuard({ verifyAccessToken: jest.fn() } as unknown as AuthTokenService);
    const unauthenticatedContext = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    await expect(tokenGuard.canActivate(unauthenticatedContext)).rejects.toThrow(
      new UnauthorizedException('Authentication required'),
    );

    const rolesGuard = new RolesGuard(new Reflector());
    const handler = Object.getOwnPropertyDescriptor(AuditLogsController.prototype, 'findAll')?.value;
    const disallowedContext = {
      getHandler: () => handler,
      getClass: () => AuditLogsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: Role.RECEPTIONIST } }) }),
    } as unknown as ExecutionContext;
    expect(() => rolesGuard.canActivate(disallowedContext)).toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
  });
});
