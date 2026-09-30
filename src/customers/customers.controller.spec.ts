/// <reference types="jest" />

import { Role } from '../common/constants/role.enum';
import type { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { Gender } from './enums/gender.enum';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('./customers.service', () => ({
  CustomersService: class CustomersService {},
}));

describe('CustomersController', () => {
  it('passes the authenticated user ID when creating a customer', async () => {
    const createCustomer = jest.fn().mockResolvedValue({ customerId: 'CUS-000001' });
    const controller = new CustomersController({
      createCustomer,
    } as unknown as CustomersService);
    const dto = { name: 'Customer One', phone: '9876543210', gender: Gender.MALE };

    await controller.create(dto, {
      sub: 'database-user-id',
      userId: 'USR-000001',
      role: Role.RECEPTIONIST,
    });

    expect(createCustomer).toHaveBeenCalledWith(dto, 'USR-000001');
  });

  it('passes the authenticated user ID when updating and deactivating', async () => {
    const updateCustomer = jest.fn();
    const deactivateCustomer = jest.fn();
    const controller = new CustomersController({
      updateCustomer,
      deactivateCustomer,
    } as unknown as CustomersService);
    const user = {
      sub: 'database-user-id',
      userId: 'USR-000001',
      role: Role.MANAGER,
    };

    await controller.update('customer-id', { name: 'Updated' }, user);
    await controller.deactivate('customer-id', user);

    expect(updateCustomer).toHaveBeenCalledWith('customer-id', { name: 'Updated' }, 'USR-000001');
    expect(deactivateCustomer).toHaveBeenCalledWith('customer-id', 'USR-000001');
  });
});
