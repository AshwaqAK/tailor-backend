import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { Role } from '../common/constants/role.enum';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AlterationStatus } from './enums/alteration-status.enum';
import { AlterationQueryDto } from './dto/alteration-query.dto';
import type { AlterationsService } from './alterations.service';
import { AlterationsController } from './alterations.controller';

jest.mock('../auth/auth-token.service', () => ({ AuthTokenService: class AuthTokenService {} }));
jest.mock('./alterations.service', () => ({ AlterationsService: class AlterationsService {} }));

describe('AlterationsController', () => {
  const user = { sub: 'database-user-id', userId: 'USR-000001', role: Role.MANAGER };

  it('passes authenticated user IDs for create and update', async () => {
    const create = jest.fn();
    const update = jest.fn();
    const createBill = jest.fn();
    const controller = new AlterationsController({
      create,
      update,
      createBill,
    } as unknown as AlterationsService);
    const dto = { customerId: 'CUS-000001', originalOrderId: 'ORD-000001' };

    await controller.create(dto as never, user);
    await controller.update('ALT-000001', { status: AlterationStatus.IN_PROGRESS }, user);
    await controller.createBill('ALT-000001', user);

    expect(create).toHaveBeenCalledWith(dto, 'USR-000001');
    expect(update).toHaveBeenCalledWith(
      'ALT-000001',
      { status: AlterationStatus.IN_PROGRESS },
      'USR-000001',
    );
    expect(createBill).toHaveBeenCalledWith('ALT-000001', 'USR-000001');
  });

  it('delegates list/retrieval and applies authentication plus role guards', async () => {
    const findAll = jest.fn();
    const findOne = jest.fn();
    const controller = new AlterationsController({
      findAll,
      findOne,
    } as unknown as AlterationsService);
    const query = Object.assign(new AlterationQueryDto(), {
      customerId: 'CUS-000001',
      status: AlterationStatus.REQUESTED,
    });

    await controller.findAll(query);
    await controller.findOne('ALT-000001');

    expect(findAll).toHaveBeenCalledWith(query);
    expect(findOne).toHaveBeenCalledWith('ALT-000001');
    expect(Reflect.getMetadata(GUARDS_METADATA, AlterationsController)).toEqual([
      AccessTokenGuard,
      RolesGuard,
    ]);
  });
});
