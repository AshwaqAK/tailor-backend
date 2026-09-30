/// <reference types="jest" />

import { Role } from '../common/constants/role.enum';
import { FabricType } from './enums/fabric-type.enum';
import { QuantityUnit } from './enums/quantity-unit.enum';
import type { FabricsService } from './fabrics.service';
import { FabricsController } from './fabrics.controller';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('./fabrics.service', () => ({
  FabricsService: class FabricsService {},
}));

describe('FabricsController', () => {
  const user = {
    sub: 'database-user-id',
    userId: 'USR-000001',
    role: Role.MANAGER,
  };

  it('passes the authenticated user ID when creating a fabric', async () => {
    const create = jest.fn();
    const controller = new FabricsController({ create } as unknown as FabricsService);
    const dto = {
      name: 'Premium Cotton',
      type: FabricType.COTTON,
      color: 'Navy Blue',
      quantity: 10,
      unit: QuantityUnit.METER,
      pricePerUnit: 250,
    };

    await controller.create(dto, user);

    expect(create).toHaveBeenCalledWith(dto, 'USR-000001');
  });

  it('delegates list, find-one, and delete operations', async () => {
    const findAll = jest.fn();
    const findOne = jest.fn();
    const remove = jest.fn();
    const controller = new FabricsController({
      findAll,
      findOne,
      remove,
    } as unknown as FabricsService);
    const query = {
      page: 2,
      limit: 5,
      type: FabricType.COTTON,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    await controller.findAll(query);
    await controller.findOne('FAB-000001');
    await controller.remove('FAB-000001');

    expect(findAll).toHaveBeenCalledWith(query);
    expect(findOne).toHaveBeenCalledWith('FAB-000001');
    expect(remove).toHaveBeenCalledWith('FAB-000001');
  });

  it('passes the authenticated user ID when updating a fabric', async () => {
    const update = jest.fn();
    const controller = new FabricsController({ update } as unknown as FabricsService);
    const dto = { quantity: 8 };

    await controller.update('FAB-000001', dto, user);

    expect(update).toHaveBeenCalledWith('FAB-000001', dto, 'USR-000001');
  });
});
