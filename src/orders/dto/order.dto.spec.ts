/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ClothingType } from '../../measurements/enums/clothing-type.enum';
import { CreateOrderDto } from './create-order.dto';
import { UpdateOrderStatusDto } from './update-order-status.dto';
import { OrderStatus } from '../enums/order-status.enum';

describe('Order DTO validation', () => {
  const validOrder = () => ({
    customerId: 'CUS-000001',
    orderDate: '2026-01-01T00:00:00.000Z',
    items: [
      {
        clothingType: ClothingType.SHIRT,
        quantity: 1,
        unitPrice: 500,
        measurementId: '507f1f77bcf86cd799439011',
        serviceId: 'SRV-000001',
        fabricId: 'FAB-000001',
        fabricQuantity: 1.25,
      },
    ],
  });

  it('accepts a valid order and nested item', async () => {
    await expect(validate(plainToInstance(CreateOrderDto, validOrder()))).resolves.toHaveLength(0);
  });

  it('rejects missing required fields and empty items', async () => {
    const errors = await validate(
      plainToInstance(CreateOrderDto, {
        customerId: '',
        items: [],
      }),
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['customerId', 'orderDate', 'items']),
    );
  });

  it('rejects invalid nested order items and references', async () => {
    const value = validOrder();
    Object.assign(value.items[0], {
      quantity: 0,
      unitPrice: -1,
      measurementId: 'not-an-object-id',
      serviceId: 'invalid-service',
      fabricQuantity: -2,
    });
    const errors = await validate(plainToInstance(CreateOrderDto, value));
    const itemErrors = errors.find((error) => error.property === 'items')?.children?.[0]
      ?.children;

    expect(itemErrors?.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'quantity',
        'unitPrice',
        'measurementId',
        'serviceId',
        'fabricQuantity',
      ]),
    );
  });

  it('rejects immutable and unsupported create fields', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validOrder(),
      orderId: 'ORD-000001',
      status: OrderStatus.DELIVERED,
      createdBy: 'USR-000001',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['orderId', 'status', 'createdBy']),
    );
  });

  it('accepts only an existing enum value for status updates', async () => {
    await expect(
      validate(plainToInstance(UpdateOrderStatusDto, { status: OrderStatus.IN_PROGRESS })),
    ).resolves.toHaveLength(0);
    const errors = await validate(
      plainToInstance(UpdateOrderStatusDto, { status: 'UNKNOWN' }),
    );

    expect(errors[0]?.property).toBe('status');
  });
});
