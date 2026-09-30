/// <reference types="jest" />

import 'reflect-metadata';

import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import type { AuthTokenService } from '../auth/auth-token.service';
import { Role } from '../common/constants/role.enum';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import {
  AccessTokenGuard,
  AuthenticatedRequest,
} from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import {
  OrderPaymentsController,
  PaymentsController,
} from './payments.controller';
import type { PaymentsService } from './payments.service';
import { PaymentIdPipe } from './pipes/payment-id.pipe';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('./payments.service', () => ({
  PaymentsService: class PaymentsService {},
}));

describe('Payments controllers', () => {
  const user = {
    sub: 'database-user-id',
    userId: 'USR-000001',
    role: Role.MANAGER,
  };

  it('passes the authenticated user ID when creating a payment', async () => {
    const create = jest.fn();
    const controller = new PaymentsController({ create } as unknown as PaymentsService);
    const dto = {
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      amount: 250,
      paymentMethod: PaymentMethod.CASH,
    };

    await controller.create(dto, user);

    expect(create).toHaveBeenCalledWith(dto, 'USR-000001');
  });

  it('delegates payment listing and business-ID retrieval', async () => {
    const findAll = jest.fn();
    const findOne = jest.fn();
    const controller = new PaymentsController({
      findAll,
      findOne,
    } as unknown as PaymentsService);
    const query = {
      page: 2,
      limit: 5,
      customerId: 'CUS-000001',
      status: PaymentStatus.SUCCESS,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    await controller.findAll(query);
    await controller.findOne('PAY-000001');

    expect(findAll).toHaveBeenCalledWith(query);
    expect(findOne).toHaveBeenCalledWith('PAY-000001');
  });

  it('delegates order-scoped payment history with pagination', async () => {
    const findByOrder = jest.fn();
    const controller = new OrderPaymentsController({
      findByOrder,
    } as unknown as PaymentsService);
    const query = {
      page: 1,
      limit: 10,
      sortBy: 'paidAt' as const,
      sortOrder: 'desc' as const,
    };

    await controller.findByOrder({ orderId: 'ORD-000001' }, query);

    expect(findByOrder).toHaveBeenCalledWith('ORD-000001', query);
  });

  it('passes the authenticated user ID to the controlled refund operation', async () => {
    const refund = jest.fn();
    const controller = new PaymentsController({ refund } as unknown as PaymentsService);

    await controller.refund('PAY-000001', user);

    expect(refund).toHaveBeenCalledWith('PAY-000001', 'USR-000001');
  });

  it('protects every payment controller with authentication and role guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PaymentsController) as unknown[]).toEqual([
      AccessTokenGuard,
      RolesGuard,
    ]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, OrderPaymentsController) as unknown[],
    ).toEqual([AccessTokenGuard, RolesGuard]);
  });

  it('rejects unauthenticated access to a payment endpoint', async () => {
    const guard = new AccessTokenGuard({
      verifyAccessToken: jest.fn(),
    } as unknown as AuthTokenService);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }) as AuthenticatedRequest,
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Authentication required'),
    );
  });

  it('rejects an unauthorized role and allows an authorized role for refunds', () => {
    const guard = new RolesGuard(new Reflector());
    const refundHandler = Object.getOwnPropertyDescriptor(
      PaymentsController.prototype,
      'refund',
    )?.value as object;
    const createContext = (role: Role) =>
      ({
        getHandler: () => refundHandler,
        getClass: () => PaymentsController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { ...user, role },
          }),
        }),
      }) as unknown as ExecutionContext;

    expect(() => guard.canActivate(createContext(Role.TAILOR))).toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
    expect(guard.canActivate(createContext(Role.MANAGER))).toBe(true);
  });

  it('applies the established read roles to payment retrieval', () => {
    const findAllHandler: unknown = Object.getOwnPropertyDescriptor(
      PaymentsController.prototype,
      'findAll',
    )?.value;
    const findByOrderHandler: unknown = Object.getOwnPropertyDescriptor(
      OrderPaymentsController.prototype,
      'findByOrder',
    )?.value;

    expect(Reflect.getMetadata(ROLES_KEY, findAllHandler as object) as Role[]).toEqual([
      Role.SUPER_ADMIN,
      Role.MANAGER,
      Role.RECEPTIONIST,
      Role.TAILOR,
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, findByOrderHandler as object) as Role[],
    ).toEqual([Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TAILOR]);
  });

  it('restricts payment creation and refunds to established write roles', () => {
    const createHandler: unknown = Object.getOwnPropertyDescriptor(
      PaymentsController.prototype,
      'create',
    )?.value;
    const refundHandler: unknown = Object.getOwnPropertyDescriptor(
      PaymentsController.prototype,
      'refund',
    )?.value;
    const writeRoles = [Role.SUPER_ADMIN, Role.MANAGER, Role.RECEPTIONIST];

    expect(Reflect.getMetadata(ROLES_KEY, createHandler as object) as Role[]).toEqual(
      writeRoles,
    );
    expect(Reflect.getMetadata(ROLES_KEY, refundHandler as object) as Role[]).toEqual(
      writeRoles,
    );
    expect(writeRoles).not.toContain(Role.TAILOR);
  });

  it('validates payment business IDs used by retrieval and refund routes', () => {
    const pipe = new PaymentIdPipe();

    expect(pipe.transform('PAY-000001')).toBe('PAY-000001');
    expect(() => pipe.transform('payment-1')).toThrow(
      new BadRequestException('paymentId must be a valid payment ID'),
    );
  });
});
