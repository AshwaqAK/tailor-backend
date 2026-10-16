import 'reflect-metadata';

jest.mock('@nestjs/mongoose', () => {
  const mongoose = require('mongoose') as typeof import('mongoose');
  const propertyDefinitions = new WeakMap<Function, Record<string, Record<string, unknown>>>();
  const schemaOptions = new WeakMap<Function, Record<string, unknown>>();

  const toSchemaType = (type: unknown): unknown => {
    if (Array.isArray(type)) return [toSchemaType(type[0])];
    if (
      typeof type === 'function' &&
      ![String, Number, Boolean, Date, mongoose.Schema.Types.ObjectId].includes(type as never)
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
        definitions[property] = {
          ...(options.type === undefined && Reflect.getMetadata('design:type', target, property)
            ? { type: Reflect.getMetadata('design:type', target, property) }
            : {}),
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

import { Alteration, AlterationSchema } from './alteration.schema';
import { AlterationStatus } from '../enums/alteration-status.enum';
import { OrderItemSchema } from '../../orders/schemas/order-item.schema';
import { OrderSchema } from '../../orders/schemas/order.schema';

describe('Alteration schema', () => {
  let alterationModel: Model<Alteration>;

  const validData = () => ({
    alterationId: 'ALT-000001',
    customerId: 'CUS-000001',
    originalOrderId: 'ORD-000001',
    originalOrderItemId: new mongoose.Types.ObjectId(),
    description: 'Shorten sleeves by two centimetres',
    createdBy: 'user-1',
    updatedBy: 'user-1',
  });

  beforeAll(() => {
    alterationModel = mongoose.model<Alteration>('AlterationSchemaValidation', AlterationSchema);
  });

  afterAll(() => {
    delete mongoose.models.AlterationSchemaValidation;
  });

  it('accepts valid alteration data and applies safe defaults', () => {
    const alteration = new alterationModel(validData());

    expect(alteration.validateSync()).toBeUndefined();
    expect(alteration.status).toBe(AlterationStatus.REQUESTED);
    expect(alteration.charge).toBe(0);
    expect(alteration.requestDate).toBeInstanceOf(Date);
  });

  it.each([
    ['customerId', 'customerId'],
    ['originalOrderId', 'originalOrderId'],
    ['originalOrderItemId', 'originalOrderItemId'],
    ['description', 'description'],
  ])('requires %s', (field) => {
    const data = validData();
    delete (data as Record<string, unknown>)[field];

    expect(new alterationModel(data).validateSync()?.errors[field]).toBeDefined();
  });

  it('rejects invalid status, negative charge, and invalid completion date', () => {
    const alteration = new alterationModel({
      ...validData(),
      status: 'UNKNOWN',
      charge: -1,
      requestDate: new Date('2026-10-10T00:00:00.000Z'),
      completionDate: new Date('2026-10-09T00:00:00.000Z'),
    });

    const errors = alteration.validateSync()?.errors;
    expect(errors?.status).toBeDefined();
    expect(errors?.charge).toBeDefined();
    expect(errors?.completionDate).toBeDefined();
  });

  it('uses the existing string business IDs and ObjectId order-item reference conventions', () => {
    expect(AlterationSchema.path('customerId').options.type).toBe(String);
    expect(AlterationSchema.path('originalOrderId').options.type).toBe(String);
    expect(AlterationSchema.path('originalOrderItemId').instance).toBe('ObjectId');
    expect(OrderSchema.path('orderId').instance).toBe('String');
    expect(OrderItemSchema.path('_id').instance).toBe('ObjectId');
  });
});
