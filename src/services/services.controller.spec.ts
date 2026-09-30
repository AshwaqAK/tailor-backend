/// <reference types="jest" />

import { Role } from '../common/constants/role.enum';
import { ServiceCategory } from './enums/service-category.enum';
import type { ServicesService } from './services.service';
import { ServicesController } from './services.controller';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('./services.service', () => ({
  ServicesService: class ServicesService {},
}));

describe('ServicesController', () => {
  const user = {
    sub: 'database-user-id',
    userId: 'USR-000001',
    role: Role.MANAGER,
  };

  it('passes the authenticated user ID when creating a service', async () => {
    const create = jest.fn();
    const controller = new ServicesController({ create } as unknown as ServicesService);
    const dto = {
      name: 'Premium Stitching',
      category: ServiceCategory.STITCHING,
      price: 750,
    };

    await controller.create(dto, user);

    expect(create).toHaveBeenCalledWith(dto, 'USR-000001');
  });

  it('delegates list, find-one, and delete operations', async () => {
    const findAll = jest.fn();
    const findOne = jest.fn();
    const remove = jest.fn();
    const controller = new ServicesController({
      findAll,
      findOne,
      remove,
    } as unknown as ServicesService);
    const query = {
      page: 2,
      limit: 5,
      category: ServiceCategory.STITCHING,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    await controller.findAll(query);
    await controller.findOne('SRV-000001');
    await controller.remove('SRV-000001');

    expect(findAll).toHaveBeenCalledWith(query);
    expect(findOne).toHaveBeenCalledWith('SRV-000001');
    expect(remove).toHaveBeenCalledWith('SRV-000001');
  });

  it('passes the authenticated user ID when updating a service', async () => {
    const update = jest.fn();
    const controller = new ServicesController({ update } as unknown as ServicesService);
    const dto = { price: 800 };

    await controller.update('SRV-000001', dto, user);

    expect(update).toHaveBeenCalledWith('SRV-000001', dto, 'USR-000001');
  });
});
