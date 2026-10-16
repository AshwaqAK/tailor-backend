/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ClothingType } from '../../measurements/enums/clothing-type.enum';
import { CreateOrderItemDto, OrderItemType } from './create-order-item.dto';
import { CreateOrderDto } from './create-order.dto';
import { UpdateOrderStatusDto } from './update-order-status.dto';
import { OrderStatus } from '../enums/order-status.enum';

describe('Order DTO validation', () => {
  const validTailoringItem = () => ({
    clothingType: ClothingType.SHIRT,
    garmentTypeId: 'GRT-000001',
    quantity: 1,
    unitPrice: 500,
    measurementId: '507f1f77bcf86cd799439011',
    serviceId: 'SRV-000001',
    fabricId: 'FAB-000001',
    fabricQuantity: 1.25,
  });

  const validOrder = () => ({
    customerId: 'CUS-000001',
    orderDate: '2026-01-01T00:00:00.000Z',
    items: [validTailoringItem()],
  });

  const validateItem = (item: Record<string, unknown>) =>
    validate(plainToInstance(CreateOrderItemDto, item));

  const errorProperties = async (item: Record<string, unknown>) =>
    (await validateItem(item)).map((error) => error.property);

  it('accepts a legacy tailoring item without itemType', async () => {
    const item = plainToInstance(CreateOrderItemDto, validTailoringItem());

    expect(item.itemType).toBe(OrderItemType.TAILORING);
    await expect(validate(item)).resolves.toHaveLength(0);
  });

  it('accepts an explicit TAILORING item', async () => {
    await expect(
      validateItem({ ...validTailoringItem(), itemType: OrderItemType.TAILORING }),
    ).resolves.toHaveLength(0);
  });

  it('accepts a valid FABRIC_SALE item without tailoring fields or unitPrice', async () => {
    await expect(
      validateItem({
        itemType: OrderItemType.FABRIC_SALE,
        fabricId: 'FAB-000001',
        quantity: 1.25,
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects excessive fabric-sale quantity precision', async () => {
    await expect(
      errorProperties({
        itemType: OrderItemType.FABRIC_SALE,
        fabricId: 'FAB-000001',
        quantity: 1.2345,
      }),
    ).resolves.toContain('quantity');
  });

  it('requires fabricId for FABRIC_SALE items', async () => {
    await expect(
      errorProperties({ itemType: OrderItemType.FABRIC_SALE, quantity: 2 }),
    ).resolves.toContain('fabricId');
  });

  it('requires a positive quantity for FABRIC_SALE items', async () => {
    await expect(
      errorProperties({ itemType: OrderItemType.FABRIC_SALE, fabricId: 'FAB-000001' }),
    ).resolves.toContain('quantity');
    await expect(
      errorProperties({
        itemType: OrderItemType.FABRIC_SALE,
        fabricId: 'FAB-000001',
        quantity: 0,
      }),
    ).resolves.toContain('quantity');
  });

  it('requires tailoring fields for TAILORING items', async () => {
    await expect(
      errorProperties({ itemType: OrderItemType.TAILORING, quantity: 1 }),
    ).resolves.toEqual(expect.arrayContaining(['garmentTypeId', 'unitPrice', 'measurementId']));
  });

  it('rejects fractional tailoring quantities', async () => {
    await expect(errorProperties({ ...validTailoringItem(), quantity: 1.25 })).resolves.toContain(
      'quantity',
    );
  });

  it('rejects tailoring-specific fields on FABRIC_SALE items', async () => {
    const errors = await validateItem({
      itemType: OrderItemType.FABRIC_SALE,
      fabricId: 'FAB-000001',
      quantity: 2,
      garmentTypeId: 'GRT-000001',
      measurementId: '507f1f77bcf86cd799439011',
      unitPrice: 500,
      customizations: { Embroidery: 3 },
      serviceId: 'SRV-000001',
      fabricQuantity: 1,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'garmentTypeId',
        'measurementId',
        'unitPrice',
        'customizations',
        'serviceId',
        'fabricQuantity',
      ]),
    );
  });

  it('rejects an invalid itemType', async () => {
    await expect(
      errorProperties({ ...validTailoringItem(), itemType: 'INVALID' }),
    ).resolves.toContain('itemType');
  });

  it('accepts a valid order and nested item', async () => {
    await expect(validate(plainToInstance(CreateOrderDto, validOrder()))).resolves.toHaveLength(0);
  });

  it('rejects an invalid garment type reference', async () => {
    const value = validOrder();
    value.items[0].garmentTypeId = 'GARMENT-1';
    const errors = await validate(plainToInstance(CreateOrderDto, value));
    const itemErrors = errors.find((error) => error.property === 'items')?.children?.[0]?.children;

    expect(itemErrors?.map((error) => error.property)).toContain('garmentTypeId');
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
    const itemErrors = errors.find((error) => error.property === 'items')?.children?.[0]?.children;

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
    const errors = await validate(plainToInstance(UpdateOrderStatusDto, { status: 'UNKNOWN' }));

    expect(errors[0]?.property).toBe('status');
  });
});
