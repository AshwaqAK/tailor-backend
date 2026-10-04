/// <reference types="jest" />

import { Role } from '../common/constants/role.enum';
import { ClothingType } from '../measurements/enums/clothing-type.enum';
import { OrderStatus } from './enums/order-status.enum';
import type { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('./orders.service', () => ({ OrdersService: class OrdersService {} }));

describe('OrdersController', () => {
  const user = {
    sub: 'database-user-id',
    userId: 'USR-000001',
    role: Role.MANAGER,
  };

  it('passes the authenticated user ID when creating an order', async () => {
    const createOrder = jest.fn();
    const controller = new OrdersController({ createOrder } as unknown as OrdersService);
    const dto = {
      customerId: 'CUS-000001',
      orderDate: new Date('2026-01-01T00:00:00.000Z'),
      items: [
        {
          clothingType: ClothingType.SHIRT,
          quantity: 1,
          unitPrice: 500,
          measurementId: '507f1f77bcf86cd799439011',
        },
      ],
    };

    await controller.create(dto, user);

    expect(createOrder).toHaveBeenCalledWith(dto, 'USR-000001');
  });

  it('retrieves all orders', async () => {
    const getAllOrders = jest.fn();
    const controller = new OrdersController({ getAllOrders } as unknown as OrdersService);
    const query = { limit: 20 };

    await controller.findAll(query);

    expect(getAllOrders).toHaveBeenCalledWith(query);
  });

  it('passes the authenticated user ID when updating status', async () => {
    const updateOrderStatus = jest.fn();
    const controller = new OrdersController({
      updateOrderStatus,
    } as unknown as OrdersService);

    await controller.updateStatus(
      { orderId: 'ORD-000001' },
      { status: OrderStatus.CONFIRMED },
      user,
    );

    expect(updateOrderStatus).toHaveBeenCalledWith(
      'ORD-000001',
      OrderStatus.CONFIRMED,
      'USR-000001',
    );
  });
});
