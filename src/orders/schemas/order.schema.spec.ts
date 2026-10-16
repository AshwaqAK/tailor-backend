/// <reference types="jest" />

import 'reflect-metadata';

jest.mock('@nestjs/mongoose', () => {
  const mongoose = require('mongoose') as typeof import('mongoose');
  const propertyDefinitions = new WeakMap<Function, Record<string, Record<string, unknown>>>();
  const schemaOptions = new WeakMap<Function, Record<string, unknown>>();

  const toSchemaType = (type: unknown): unknown => {
    if (Array.isArray(type)) return [toSchemaType(type[0])];
    if (
      typeof type === 'function' &&
      type !== String &&
      type !== Number &&
      type !== Boolean &&
      type !== Date
    ) {
      return createSchema(type);
    }
    return type;
  };

  const createSchema = (target: Function): mongoose.Schema => {
    const definitions = propertyDefinitions.get(target) ?? {};
    return new mongoose.Schema(
      Object.fromEntries(
        Object.entries(definitions).map(([property, options]) => [
          property,
          options.type === undefined ? options : { ...options, type: toSchemaType(options.type) },
        ]),
      ),
      schemaOptions.get(target),
    );
  };

  return {
    Prop:
      (options: Record<string, unknown> = {}) =>
      (target: object, property: string) => {
        const definitions = propertyDefinitions.get(target.constructor) ?? {};
        const reflectedType = Reflect.getMetadata('design:type', target, property);
        definitions[property] = {
          ...(options.type === undefined && reflectedType ? { type: reflectedType } : {}),
          ...options,
        };
        propertyDefinitions.set(target.constructor, definitions);
      },
    Schema:
      (options: Record<string, unknown> = {}) =>
      (target: Function) => {
        schemaOptions.set(target, options);
      },
    SchemaFactory: { createForClass: createSchema },
  };
});

import mongoose, { Model } from 'mongoose';

import { OrderType } from '../enums/order-type.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { Order, OrderSchema } from './order.schema';
import { OrderItemSchema } from './order-item.schema';

describe('Order schema', () => {
  let orderModel: Model<Order>;

  const validOrder = (overrides: Record<string, unknown> = {}) => ({
    orderId: 'ORD-000001',
    customerId: 'CUS-000001',
    orderDate: new Date('2026-10-16T00:00:00.000Z'),
    status: OrderStatus.DRAFT,
    totalAmount: 100,
    paidAmount: 0,
    balanceAmount: 100,
    createdBy: 'USR-000001',
    updatedBy: 'USR-000001',
    ...overrides,
  });

  beforeAll(() => {
    orderModel = mongoose.model<Order>('OrderSchemaValidation', OrderSchema);
  });

  afterAll(() => {
    delete mongoose.models.OrderSchemaValidation;
  });

  it('preserves legacy orders and defaults newly constructed orders to STANDARD', () => {
    const order = new orderModel(validOrder());

    expect(order.orderType).toBe(OrderType.STANDARD);
    expect(order.validateSync()).toBeUndefined();
  });

  it('accepts an explicit standard order without alteration links', () => {
    const order = new orderModel(validOrder({ orderType: OrderType.STANDARD }));

    expect(order.validateSync()).toBeUndefined();
  });

  it('accepts a valid alteration billing order with business-ID references', () => {
    const order = new orderModel(
      validOrder({
        orderType: OrderType.ALTERATION,
        sourceAlterationId: 'ALT-000001',
        originalOrderId: 'ORD-000009',
      }),
    );

    expect(order.validateSync()).toBeUndefined();
    expect(OrderSchema.path('sourceAlterationId').options.ref).toBe('Alteration');
    expect(OrderSchema.path('originalOrderId').options.ref).toBe('Order');
  });

  it.each(['sourceAlterationId', 'originalOrderId'])(
    'requires %s for an alteration billing order',
    (field) => {
      const data = validOrder({
        orderType: OrderType.ALTERATION,
        sourceAlterationId: 'ALT-000001',
        originalOrderId: 'ORD-000009',
      });
      delete data[field];

      expect(new orderModel(data).validateSync()?.errors[field]).toBeDefined();
    },
  );

  it('rejects invalid classification and invalid business references', () => {
    const invalidType = new orderModel(validOrder({ orderType: 'OTHER' }));
    const invalidReferences = new orderModel(
      validOrder({
        orderType: OrderType.ALTERATION,
        sourceAlterationId: 'ALT-1',
        originalOrderId: 'ORD-1',
      }),
    );

    expect(invalidType.validateSync()?.errors.orderType).toBeDefined();
    expect(invalidReferences.validateSync()?.errors.sourceAlterationId).toBeDefined();
    expect(invalidReferences.validateSync()?.errors.originalOrderId).toBeDefined();
  });

  it('keeps Order Item order references compatible with the Order business ID', () => {
    expect(OrderSchema.path('orderId').instance).toBe('String');
    expect(OrderItemSchema.path('orderId').instance).toBe('String');
    expect(OrderItemSchema.path('orderId').options.ref).toBe('Order');
  });

  it('defines a partial unique index for alteration billing orders', () => {
    const index = OrderSchema.indexes().find(
      ([, options]) => options?.name === 'unique_alteration_billing_order',
    );

    expect(index).toBeDefined();
    expect(index?.[1]).toEqual(
      expect.objectContaining({
        unique: true,
        partialFilterExpression: {
          orderType: OrderType.ALTERATION,
          sourceAlterationId: { $type: 'string' },
        },
      }),
    );
  });
});
