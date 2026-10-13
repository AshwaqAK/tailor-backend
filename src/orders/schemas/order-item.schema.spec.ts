/// <reference types="jest" />

import 'reflect-metadata';

jest.mock('@nestjs/mongoose', () => {
  const mongoose = require('mongoose') as typeof import('mongoose');
  const propertyDefinitions = new WeakMap<Function, Record<string, Record<string, unknown>>>();
  const schemaOptions = new WeakMap<Function, Record<string, unknown>>();

  const toSchemaType = (type: unknown): unknown => {
    if (Array.isArray(type)) {
      return [toSchemaType(type[0])];
    }

    if (typeof type === 'function' && type !== String && type !== Number && type !== Boolean && type !== Date) {
      return createSchema(type);
    }

    return type;
  };

  const createSchema = (target: Function): mongoose.Schema => {
    const definitions = propertyDefinitions.get(target) ?? {};
    const convertedDefinitions = Object.fromEntries(
      Object.entries(definitions).map(([property, options]) => [
        property,
        options.type === undefined ? options : { ...options, type: toSchemaType(options.type) },
      ]),
    );

    return new mongoose.Schema(convertedDefinitions, schemaOptions.get(target));
  };

  return {
    InjectConnection: () => () => undefined,
    InjectModel: () => () => undefined,
    Prop: (options: Record<string, unknown> = {}) => (target: object, property: string) => {
      const targetDefinitions = propertyDefinitions.get(target.constructor) ?? {};
      const reflectedType = Reflect.getMetadata('design:type', target, property);
      targetDefinitions[property] = {
        ...(options.type === undefined && reflectedType ? { type: reflectedType } : {}),
        ...options,
      };
      propertyDefinitions.set(target.constructor, targetDefinitions);
    },
    Schema: (options: Record<string, unknown> = {}) => (target: Function) => {
      schemaOptions.set(target, options);
    },
    SchemaFactory: {
      createForClass: createSchema,
    },
  };
});

import mongoose, { Model } from 'mongoose';

import { FabricType } from '../../fabrics/enums/fabric-type.enum';
import { QuantityUnit } from '../../fabrics/enums/quantity-unit.enum';
import { PricingType } from '../../garment-types/enums/pricing-type.enum';
import {
  FabricSaleSnapshot,
  OrderItem,
  OrderItemSchema,
  OrderItemType,
} from './order-item.schema';

describe('OrderItem schema', () => {
  let orderItemModel: Model<OrderItem>;

  const tailoringPricingSnapshot = {
    garmentTypeName: 'Shirt',
    garmentTypeCode: 'SHIRT',
    baseTailoringPrice: 485,
    customizationGroups: [
      {
        groupName: 'Collar',
        options: [
          {
            optionName: 'Spread',
            pricingType: PricingType.FIXED,
            configuredPrice: 25,
            calculatedCharge: 25,
          },
        ],
        calculatedCharge: 25,
      },
    ],
    calculatedCustomizationCharge: 25,
    calculatedPerGarmentTailoringAmount: 510,
    quantity: 1,
    finalTailoringTotal: 510,
  };

  const fabricSaleSnapshot = {
    fabricId: 'FAB-000001',
    name: 'Cotton',
    type: FabricType.COTTON,
    color: 'White',
    unit: QuantityUnit.METER,
    pricePerUnit: 125.5,
    quantitySold: 2.25,
    lineTotal: 282.38,
  } satisfies FabricSaleSnapshot;

  const baseItem = () => ({
    orderId: 'ORD-000001',
    quantity: 1,
    unitPrice: 510,
  });

  beforeAll(() => {
    orderItemModel = mongoose.model<OrderItem>('OrderItemSchemaValidation', OrderItemSchema);
  });

  afterAll(async () => {
    delete mongoose.models.OrderItemSchemaValidation;
  });

  it('accepts a tailoring item and defaults itemType to TAILORING', () => {
    const item = new orderItemModel({
      ...baseItem(),
      garmentTypeId: 'GRT-000001',
      tailoringPricingSnapshot,
    });

    expect(item.itemType).toBe(OrderItemType.TAILORING);
    expect(item.validateSync()).toBeUndefined();
  });

  it('requires tailoring fields for an explicit TAILORING item', () => {
    const item = new orderItemModel({
      ...baseItem(),
      itemType: OrderItemType.TAILORING,
    });

    const error = item.validateSync();

    expect(error?.errors.garmentTypeId).toBeDefined();
    expect(error?.errors.tailoringPricingSnapshot).toBeDefined();
  });

  it('accepts a fabric sale with its required snapshot and no tailoring fields', () => {
    const item = new orderItemModel({
      ...baseItem(),
      itemType: OrderItemType.FABRIC_SALE,
      unitPrice: 125.5,
      fabricSaleSnapshot,
    });

    expect(item.validateSync()).toBeUndefined();
  });

  it('requires fabricSaleSnapshot for a FABRIC_SALE item', () => {
    const item = new orderItemModel({
      ...baseItem(),
      itemType: OrderItemType.FABRIC_SALE,
    });

    expect(item.validateSync()?.errors.fabricSaleSnapshot).toBeDefined();
  });

  it('preserves legacy documents without itemType as tailoring items', () => {
    const item = new orderItemModel({
      ...baseItem(),
      garmentTypeId: 'GRT-000001',
      tailoringPricingSnapshot,
    });

    expect(item.validateSync()).toBeUndefined();
    expect(item.itemType).toBe(OrderItemType.TAILORING);
  });
});
