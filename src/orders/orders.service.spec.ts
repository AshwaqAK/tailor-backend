/// <reference types="jest" />

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Connection, Model } from 'mongoose';

import type { CustomerDocument } from '../customers/schemas/customer.schema';
import type { GarmentTypeDocument } from '../garment-types/schemas/garment-type.schema';
import { GarmentTypePricingService } from '../garment-types/garment-type-pricing.service';
import { InputType } from '../garment-types/enums/input-type.enum';
import { PricingType } from '../garment-types/enums/pricing-type.enum';
import type { FabricsService } from '../fabrics/fabrics.service';
import { FabricType } from '../fabrics/enums/fabric-type.enum';
import { QuantityUnit } from '../fabrics/enums/quantity-unit.enum';
import type { MeasurementDocument } from '../measurements/schemas/measurement.schema';
import { ClothingType } from '../measurements/enums/clothing-type.enum';
import { FitPreference } from '../measurements/enums/fit-preference.enum';
import type { ServicesService } from '../services/services.service';
import type { CounterDocument } from '../users/schemas/counter.schema';
import { OrderItemType } from './dto/create-order-item.dto';
import type { CreateOrderDto } from './dto/create-order.dto';
import { OrderPaymentStatus } from './enums/order-payment-status.enum';
import { OrderStatus } from './enums/order-status.enum';
import type { OrderDocument } from './schemas/order.schema';
import type { OrderItemDocument } from './schemas/order-item.schema';
import { OrdersService } from './orders.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { AuditEntityType } from '../audit-logs/enums/audit-entity-type.enum';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));
jest.mock('../fabrics/fabrics.service', () => ({
  FabricsService: class FabricsService {},
}));
jest.mock('../services/services.service', () => ({
  ServicesService: class ServicesService {},
}));

describe('OrdersService', () => {
  const orderDate = new Date('2026-01-01T00:00:00.000Z');
  const measurementId = '507f1f77bcf86cd799439011';
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let orderModel: jest.Mock & { findOne: jest.Mock; find: jest.Mock };
  let orderItemModel: jest.Mock & { find: jest.Mock };
  let customerModel: { exists: jest.Mock };
  let measurementModel: { findById: jest.Mock };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let garmentTypeModel: { findOne: jest.Mock };
  let fabricsService: { deductStock: jest.Mock };
  let servicesService: { findActiveByIds: jest.Mock };
  let garmentTypePricingService: { calculateTailoringPricing: jest.Mock };
  let auditLogsService: { record: jest.Mock };
  let service: OrdersService;

  const createOrderDocument = (overrides: Partial<OrderDocument> = {}) => {
    const save = jest.fn();
    const order = {
      orderId: 'ORD-000007',
      customerId: 'CUS-000001',
      orderDate,
      status: OrderStatus.DRAFT,
      totalAmount: 500,
      paidAmount: 0,
      balanceAmount: 500,
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
      save,
      ...overrides,
    } as unknown as OrderDocument;
    save.mockResolvedValue(order);
    return { order, save };
  };

  const createOrderItemDocument = (overrides: Partial<OrderItemDocument> = {}) => {
    const save = jest.fn();
    const item = {
      orderId: 'ORD-000007',
      clothingType: ClothingType.SHIRT,
      garmentTypeId: 'GRT-000001',
      quantity: 1,
      unitPrice: 500,
      save,
      ...overrides,
    } as unknown as OrderItemDocument;
    save.mockResolvedValue(item);
    return { item, save };
  };

  const measurement = {
    _id: measurementId,
    customerId: 'CUS-000001',
    clothingType: ClothingType.SHIRT,
    garmentTypeId: 'GRT-000001',
    version: 2,
    measurements: new Map([
      ['chest', 40],
      ['waist', 36],
    ]),
    fitPreference: FitPreference.REGULAR,
    notes: 'measurement note',
    measuredAt: new Date('2025-12-20T00:00:00.000Z'),
  } as unknown as MeasurementDocument;

  const validDto = (): CreateOrderDto => ({
    customerId: 'CUS-000001',
    orderDate,
    items: [
      {
        clothingType: ClothingType.SHIRT,
        garmentTypeId: 'GRT-000001',
        quantity: 3,
        unitPrice: 500,
        measurementId,
        serviceId: 'SRV-000001',
        fabricId: 'FAB-000001',
        fabricQuantity: 1.25,
      },
    ],
  });

  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(true),
      endSession: jest.fn(),
    };
    orderModel = Object.assign(jest.fn(), { findOne: jest.fn(), find: jest.fn() });
    orderItemModel = Object.assign(jest.fn(), { find: jest.fn() });
    customerModel = { exists: jest.fn() };
    measurementModel = { findById: jest.fn() };
    counterModel = { findOneAndUpdate: jest.fn() };
    garmentTypeModel = { findOne: jest.fn() };
    fabricsService = { deductStock: jest.fn() };
    servicesService = { findActiveByIds: jest.fn() };
    garmentTypePricingService = {
      calculateTailoringPricing: jest.fn().mockReturnValue({
        baseTailoringPrice: 485,
        customizationGroups: [
          {
            groupName: 'Embroidery',
            options: [
              {
                optionName: 'Stitches',
                pricingType: PricingType.PER_UNIT,
                configuredPrice: 5,
                submittedValue: 3,
                calculatedCharge: 15,
              },
            ],
            calculatedCharge: 15,
          },
        ],
        calculatedCustomizationCharge: 15,
        calculatedPerGarmentTailoringAmount: 500,
        quantity: 3,
        finalTailoringTotal: 1500,
      }),
    };
    auditLogsService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new OrdersService(
      { startSession: jest.fn().mockResolvedValue(session) } as unknown as Connection,
      orderModel as unknown as Model<OrderDocument>,
      orderItemModel as unknown as Model<OrderItemDocument>,
      customerModel as unknown as Model<CustomerDocument>,
      measurementModel as unknown as Model<MeasurementDocument>,
      counterModel as unknown as Model<CounterDocument>,
      garmentTypeModel as unknown as Model<GarmentTypeDocument>,
      fabricsService as unknown as FabricsService,
      servicesService as unknown as ServicesService,
      garmentTypePricingService as unknown as GarmentTypePricingService,
      auditLogsService as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const previewGarmentType = {
    garmentTypeId: 'GRT-000001',
    tailoringService: { serviceId: 'TAILORING', basePrice: 485 },
    customizationGroups: [
      {
        name: 'Collar',
        sortOrder: 0,
        options: [
          {
            name: 'Spread',
            inputType: InputType.SINGLE_SELECT,
            price: 25,
            pricingType: PricingType.FIXED,
            sortOrder: 0,
          },
        ],
      },
    ],
  };

  const mockPreviewGarmentType = () => {
    garmentTypeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(previewGarmentType),
    });
    garmentTypePricingService.calculateTailoringPricing.mockImplementation(
      (configuration, selections, quantity) =>
        new GarmentTypePricingService().calculateTailoringPricing(
          configuration,
          selections,
          quantity,
        ),
    );
  };

  it('returns a stored garment quote with customization breakdown and quantity total', async () => {
    mockPreviewGarmentType();

    await expect(
      service.previewPricing({
        garmentTypeId: 'GRT-000001',
        quantity: 3,
        customizations: { Collar: 'Spread' },
      }),
    ).resolves.toEqual({
      garmentTypeId: 'GRT-000001',
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
      quantity: 3,
      finalTailoringTotal: 1530,
    });
  });

  it('rejects invalid preview selections through the pricing engine', async () => {
    mockPreviewGarmentType();

    await expect(
      service.previewPricing({
        garmentTypeId: 'GRT-000001',
        quantity: 1,
        customizations: { Collar: 'Mandarin' },
      }),
    ).rejects.toThrow(
      new BadRequestException('Unknown customization option: Mandarin in group Collar'),
    );
  });

  it.each([0, -1, 1.5])('rejects invalid preview quantity %s', async (quantity) => {
    mockPreviewGarmentType();

    await expect(service.previewPricing({ garmentTypeId: 'GRT-000001', quantity })).rejects.toThrow(
      new BadRequestException('Garment quantity must be a positive integer'),
    );
  });

  it('does not create or modify order records', async () => {
    mockPreviewGarmentType();

    await service.previewPricing({ garmentTypeId: 'GRT-000001', quantity: 1 });

    expect(orderModel).not.toHaveBeenCalled();
    expect(orderItemModel).not.toHaveBeenCalled();
    expect(session.startTransaction).not.toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
  });

  const mockCustomerExists = () => {
    customerModel.exists.mockReturnValue({
      session: () => ({ exec: jest.fn().mockResolvedValue({ _id: 'customer-id' }) }),
    });
    garmentTypeModel.findOne.mockReturnValue({
      session: () => ({
        exec: jest.fn().mockResolvedValue({
          _id: 'garment-type-id',
          garmentTypeId: 'GRT-000001',
          name: 'Shirt',
          code: ClothingType.SHIRT,
        }),
      }),
    });
  };

  const mockMeasurement = (value: MeasurementDocument | null = measurement) => {
    measurementModel.findById.mockReturnValue({
      session: () => ({ exec: jest.fn().mockResolvedValue(value) }),
    });
  };

  it('creates an order transaction with generated ID, snapshots, calculations, and audit fields', async () => {
    mockCustomerExists();
    mockMeasurement();
    servicesService.findActiveByIds.mockResolvedValue([
      { serviceId: 'SRV-000001', name: 'Premium stitching', price: 19.999, isActive: true },
    ]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    fabricsService.deductStock.mockResolvedValue({
      fabricId: 'FAB-000001',
      name: 'Cotton',
      type: FabricType.COTTON,
      color: 'White',
      unit: QuantityUnit.METER,
      pricePerUnit: 125.5,
    });
    const { order, save: saveOrder } = createOrderDocument();
    const { item, save: saveItem } = createOrderItemDocument();
    orderModel.mockImplementation((data: Record<string, unknown>) => Object.assign(order, data));
    let capturedItemInput: Record<string, unknown> | undefined;
    orderItemModel.mockImplementation((data: Record<string, unknown>) => {
      capturedItemInput = data;
      return Object.assign(item, data);
    });

    const dto = validDto();
    dto.items[0].clothingType = ClothingType.KURTA;
    dto.items[0].unitPrice = 999;
    dto.items[0].customizations = { Embroidery: 3 };
    const result = await service.createOrder(dto, 'USR-000009');

    expect(garmentTypePricingService.calculateTailoringPricing).toHaveBeenCalledWith(
      expect.objectContaining({ code: ClothingType.SHIRT }),
      { Embroidery: 3 },
      3,
    );
    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'order' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({ session }),
    );
    expect(servicesService.findActiveByIds).toHaveBeenCalledWith(['SRV-000001'], session);
    expect(fabricsService.deductStock).toHaveBeenCalledWith(
      'FAB-000001',
      1.25,
      'ORD-000007',
      'USR-000009',
      session,
      ['TAILORING_ATTACHED'],
    );
    expect(orderModel).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-000007',
        customerId: 'CUS-000001',
        totalAmount: 1656.88,
        paidAmount: 0,
        balanceAmount: 1656.88,
        createdBy: 'USR-000009',
        updatedBy: 'USR-000009',
      }),
    );
    expect(orderItemModel).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-000007',
        itemType: OrderItemType.TAILORING,
        garmentTypeId: 'GRT-000001',
        clothingType: ClothingType.SHIRT,
        unitPrice: 500,
        customizations: { Embroidery: 3 },
        tailoringPricingSnapshot: {
          garmentTypeName: 'Shirt',
          garmentTypeCode: ClothingType.SHIRT,
          baseTailoringPrice: 485,
          customizationGroups: [
            {
              groupName: 'Embroidery',
              options: [
                {
                  optionName: 'Stitches',
                  pricingType: PricingType.PER_UNIT,
                  configuredPrice: 5,
                  submittedValue: 3,
                  calculatedCharge: 15,
                },
              ],
              calculatedCharge: 15,
            },
          ],
          calculatedCustomizationCharge: 15,
          calculatedPerGarmentTailoringAmount: 500,
          quantity: 3,
          finalTailoringTotal: 1500,
        },
        measurementVersion: 2,
        serviceSnapshot: {
          serviceId: 'SRV-000001',
          name: 'Premium stitching',
          price: 19.999,
          quantity: 3,
          lineAmount: 60,
        },
      }),
    );
    const itemInput = capturedItemInput as {
      measurementSnapshot: {
        customerId: string;
        garmentTypeId: string;
        measurements: Map<string, number>;
      };
      fabricSnapshot: {
        fabricId: string;
        quantityUsed: number;
        pricePerUnit: number;
      };
    };
    expect(itemInput.measurementSnapshot.customerId).toBe('CUS-000001');
    expect(itemInput.measurementSnapshot.garmentTypeId).toBe('GRT-000001');
    expect(itemInput.measurementSnapshot.measurements).toEqual(
      new Map([
        ['chest', 40],
        ['waist', 36],
      ]),
    );
    expect(itemInput.fabricSnapshot).toMatchObject({
      fabricId: 'FAB-000001',
      quantityUsed: 1.25,
      pricePerUnit: 125.5,
    });
    expect(saveOrder).toHaveBeenCalledWith({ session });
    expect(saveItem).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'USR-000009',
        action: AuditAction.CREATED,
        entityType: AuditEntityType.ORDER,
        entityId: 'ORD-000007',
        metadata: expect.objectContaining({ orderType: 'STANDARD' }),
      }),
      session,
    );
    expect(result).toEqual({ order, items: [item] });
  });

  it('rejects an order without items and rolls back', async () => {
    await expect(
      service.createOrder({ customerId: 'CUS-000001', orderDate, items: [] }, 'USR-000001'),
    ).rejects.toThrow(new BadRequestException('At least one order item is required'));
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('supports a newly configured garment through measurement, pricing, and snapshot creation', async () => {
    const garmentType = {
      _id: 'garment-type-object-id',
      garmentTypeId: 'GRT-000008',
      name: 'Sherwani',
      code: 'SHERWANI',
      tailoringService: { serviceId: 'TAILORING', basePrice: 700 },
      customizationGroups: [
        {
          name: 'Collar',
          sortOrder: 0,
          options: [
            {
              name: 'Mandarin',
              inputType: InputType.SINGLE_SELECT,
              price: 50,
              pricingType: PricingType.FIXED,
              sortOrder: 0,
            },
          ],
        },
      ],
      measurementFields: [
        {
          key: 'chest',
          name: 'Chest',
          unit: 'INCH',
          required: true,
          sortOrder: 0,
        },
      ],
    };
    mockCustomerExists();
    garmentTypeModel.findOne.mockReturnValue({
      session: () => ({ exec: jest.fn().mockResolvedValue(garmentType) }),
    });
    mockMeasurement({
      ...measurement,
      garmentTypeId: 'GRT-000008',
      clothingType: undefined,
      measurements: new Map([['chest', 40]]),
    } as MeasurementDocument);
    servicesService.findActiveByIds.mockResolvedValue([]);
    garmentTypePricingService.calculateTailoringPricing.mockImplementation(
      (configuration, selections, quantity) =>
        new GarmentTypePricingService().calculateTailoringPricing(
          configuration,
          selections,
          quantity,
        ),
    );
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 8 }),
    });
    const { order } = createOrderDocument();
    const { item } = createOrderItemDocument({ clothingType: undefined });
    orderModel.mockImplementation((data: Record<string, unknown>) => Object.assign(order, data));
    orderItemModel.mockImplementation((data: Record<string, unknown>) => Object.assign(item, data));

    const dto = validDto();
    dto.items[0].garmentTypeId = 'GRT-000008';
    delete dto.items[0].clothingType;
    dto.items[0].quantity = 2;
    dto.items[0].unitPrice = 1;
    dto.items[0].customizations = { Collar: 'Mandarin' };
    delete (dto.items[0] as { serviceId?: string }).serviceId;
    delete (dto.items[0] as { fabricId?: string; fabricQuantity?: number }).fabricId;
    delete (dto.items[0] as { fabricQuantity?: number }).fabricQuantity;

    const result = await service.createOrder(dto, 'USR-000009');

    expect(result.items[0]).toMatchObject({
      garmentTypeId: 'GRT-000008',
      clothingType: undefined,
      unitPrice: 750,
      tailoringPricingSnapshot: {
        garmentTypeName: 'Sherwani',
        garmentTypeCode: 'SHERWANI',
        baseTailoringPrice: 700,
        calculatedCustomizationCharge: 50,
        calculatedPerGarmentTailoringAmount: 750,
        quantity: 2,
        finalTailoringTotal: 1500,
      },
    });
    expect(order.totalAmount).toBe(1500);
    expect(fabricsService.deductStock).not.toHaveBeenCalled();
  });

  it('creates a fabric-only sale from database fabric pricing without tailoring data', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 9 }),
    });
    fabricsService.deductStock.mockResolvedValue({
      fabricId: 'FAB-000001',
      name: 'Cotton',
      type: FabricType.COTTON,
      color: 'White',
      unit: QuantityUnit.METER,
      pricePerUnit: 400,
    });
    const { order } = createOrderDocument();
    let capturedItemInput: Record<string, unknown> | undefined;
    orderModel.mockImplementation((data: Record<string, unknown>) => Object.assign(order, data));
    orderItemModel.mockImplementation((data: Record<string, unknown>) => {
      capturedItemInput = data;
      const { item } = createOrderItemDocument();
      return Object.assign(item, data);
    });

    const result = await service.createOrder(
      {
        customerId: 'CUS-000001',
        orderDate,
        items: [
          {
            itemType: OrderItemType.FABRIC_SALE,
            fabricId: 'FAB-000001',
            quantity: 2.5,
            unitPrice: 999,
          },
        ],
      } as never,
      'USR-000009',
    );

    expect(garmentTypeModel.findOne).not.toHaveBeenCalled();
    expect(measurementModel.findById).not.toHaveBeenCalled();
    expect(garmentTypePricingService.calculateTailoringPricing).not.toHaveBeenCalled();
    expect(fabricsService.deductStock).toHaveBeenCalledWith(
      'FAB-000001',
      2.5,
      'ORD-000009',
      'USR-000009',
      session,
      ['FABRIC_SALE'],
    );
    expect(capturedItemInput).toEqual(
      expect.objectContaining({
        itemType: OrderItemType.FABRIC_SALE,
        quantity: 2.5,
        unitPrice: 400,
        fabricSaleSnapshot: {
          fabricId: 'FAB-000001',
          name: 'Cotton',
          type: FabricType.COTTON,
          color: 'White',
          unit: QuantityUnit.METER,
          pricePerUnit: 400,
          quantitySold: 2.5,
          lineTotal: 1000,
        },
      }),
    );
    expect(capturedItemInput).not.toHaveProperty('tailoringPricingSnapshot');
    expect(result.order.totalAmount).toBe(1000);
    expect(result.order.paidAmount).toBe(0);
    expect(result.order.balanceAmount).toBe(1000);
  });

  it('accepts a whole-number quantity for a PIECE fabric sale', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 13 }),
    });
    fabricsService.deductStock.mockResolvedValue({
      fabricId: 'FAB-000001',
      name: 'Buttons',
      type: FabricType.COTTON,
      color: 'White',
      unit: QuantityUnit.PIECE,
      pricePerUnit: 20,
    });
    const { order } = createOrderDocument();
    orderModel.mockImplementation((data: Record<string, unknown>) => Object.assign(order, data));
    orderItemModel.mockImplementation((data: Record<string, unknown>) => {
      const { item } = createOrderItemDocument();
      return Object.assign(item, data);
    });

    const result = await service.createOrder(
      {
        customerId: 'CUS-000001',
        orderDate,
        items: [
          {
            itemType: OrderItemType.FABRIC_SALE,
            fabricId: 'FAB-000001',
            quantity: 3,
          },
        ],
      } as never,
      'USR-000009',
    );
    expect(result.order).toBe(order);
    expect(result.items).toHaveLength(1);
    expect(fabricsService.deductStock).toHaveBeenCalledWith(
      'FAB-000001',
      3,
      'ORD-000013',
      'USR-000009',
      session,
      ['FABRIC_SALE'],
    );
    expect(order.totalAmount).toBe(60);
  });

  it('rejects a fractional quantity for a PIECE fabric sale and aborts the transaction', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 14 }),
    });
    fabricsService.deductStock.mockResolvedValue({
      fabricId: 'FAB-000001',
      name: 'Buttons',
      type: FabricType.COTTON,
      color: 'White',
      unit: QuantityUnit.PIECE,
      pricePerUnit: 20,
    });

    await expect(
      service.createOrder(
        {
          customerId: 'CUS-000001',
          orderDate,
          items: [
            {
              itemType: OrderItemType.FABRIC_SALE,
              fabricId: 'FAB-000001',
              quantity: 1.5,
            },
          ],
        } as never,
        'USR-000009',
      ),
    ).rejects.toThrow('Fabric sale quantity must be a whole number for PIECE fabrics');
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(orderModel).not.toHaveBeenCalled();
    expect(orderItemModel).not.toHaveBeenCalled();
  });

  it('supports mixed legacy tailoring and fabric-sale lines with one aggregated stock deduction', async () => {
    mockCustomerExists();
    mockMeasurement();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 10 }),
    });
    fabricsService.deductStock.mockResolvedValue({
      fabricId: 'FAB-000001',
      name: 'Cotton',
      type: FabricType.COTTON,
      color: 'White',
      unit: QuantityUnit.METER,
      pricePerUnit: 125.5,
    });
    const { order } = createOrderDocument();
    const capturedItems: Record<string, unknown>[] = [];
    orderModel.mockImplementation((data: Record<string, unknown>) => Object.assign(order, data));
    orderItemModel.mockImplementation((data: Record<string, unknown>) => {
      capturedItems.push(data);
      const { item } = createOrderItemDocument();
      return Object.assign(item, data);
    });

    const tailoringItem = validDto().items[0];
    delete (tailoringItem as { serviceId?: string }).serviceId;
    const result = await service.createOrder(
      {
        customerId: 'CUS-000001',
        orderDate,
        items: [
          tailoringItem,
          {
            itemType: OrderItemType.FABRIC_SALE,
            fabricId: 'FAB-000001',
            quantity: 2,
          },
        ],
      } as never,
      'USR-000009',
    );

    expect(fabricsService.deductStock).toHaveBeenCalledTimes(1);
    expect(fabricsService.deductStock).toHaveBeenCalledWith(
      'FAB-000001',
      3.25,
      'ORD-000010',
      'USR-000009',
      session,
      ['TAILORING_ATTACHED', 'FABRIC_SALE'],
    );
    expect(garmentTypePricingService.calculateTailoringPricing).toHaveBeenCalledTimes(1);
    expect(measurementModel.findById).toHaveBeenCalledTimes(1);
    expect(capturedItems).toHaveLength(2);
    expect(capturedItems[0]).toEqual(
      expect.objectContaining({ itemType: OrderItemType.TAILORING }),
    );
    expect(capturedItems[1]).toEqual(
      expect.objectContaining({ itemType: OrderItemType.FABRIC_SALE }),
    );
    expect(result.order.totalAmount).toBe(1907.88);
    expect(result.order.balanceAmount).toBe(1907.88);
  });

  it('rolls back a fabric-only order when aggregated stock is insufficient', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 11 }),
    });
    fabricsService.deductStock.mockRejectedValue(
      new BadRequestException('Insufficient stock for fabric FAB-000001'),
    );

    await expect(
      service.createOrder(
        {
          customerId: 'CUS-000001',
          orderDate,
          items: [
            {
              itemType: OrderItemType.FABRIC_SALE,
              fabricId: 'FAB-000001',
              quantity: 2,
            },
          ],
        } as never,
        'USR-000009',
      ),
    ).rejects.toThrow(new BadRequestException('Insufficient stock for fabric FAB-000001'));

    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('aborts the transaction when a later fabric deduction fails', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 12 }),
    });
    fabricsService.deductStock.mockImplementation((fabricId: string) => {
      if (fabricId === 'FAB-000002') {
        return Promise.reject(new BadRequestException('Insufficient stock for fabric FAB-000002'));
      }

      return Promise.resolve({
        fabricId: 'FAB-000001',
        name: 'Cotton',
        type: FabricType.COTTON,
        color: 'White',
        unit: QuantityUnit.METER,
        pricePerUnit: 125.5,
      });
    });

    await expect(
      service.createOrder(
        {
          customerId: 'CUS-000001',
          orderDate,
          items: [
            {
              itemType: OrderItemType.FABRIC_SALE,
              fabricId: 'FAB-000001',
              quantity: 1,
            },
            {
              itemType: OrderItemType.FABRIC_SALE,
              fabricId: 'FAB-000002',
              quantity: 1,
            },
          ],
        } as never,
        'USR-000009',
      ),
    ).rejects.toThrow(new BadRequestException('Insufficient stock for fabric FAB-000002'));

    expect(fabricsService.deductStock).toHaveBeenNthCalledWith(
      1,
      'FAB-000001',
      1,
      'ORD-000012',
      'USR-000009',
      session,
      ['FABRIC_SALE'],
    );
    expect(fabricsService.deductStock).toHaveBeenNthCalledWith(
      2,
      'FAB-000002',
      1,
      'ORD-000012',
      'USR-000009',
      session,
      ['FABRIC_SALE'],
    );
    expect(orderModel).not.toHaveBeenCalled();
    expect(orderItemModel).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('rejects invalid customization selections from the pricing engine', async () => {
    mockCustomerExists();
    mockMeasurement();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    garmentTypePricingService.calculateTailoringPricing.mockImplementation(() => {
      throw new BadRequestException('Unknown customization option: Invalid in group Collar');
    });
    const dto = validDto();
    delete (dto.items[0] as { serviceId?: string }).serviceId;
    delete (dto.items[0] as { fabricId?: string; fabricQuantity?: number }).fabricId;
    delete (dto.items[0] as { fabricQuantity?: number }).fabricQuantity;

    await expect(service.createOrder(dto, 'USR-000001')).rejects.toThrow(
      new BadRequestException('Unknown customization option: Invalid in group Collar'),
    );
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])('rejects invalid item quantity %s', async (quantity) => {
    const dto = validDto();
    dto.items[0].quantity = quantity;

    await expect(service.createOrder(dto, 'USR-000001')).rejects.toThrow(
      new BadRequestException('Order service quantity must be a positive integer'),
    );
  });

  it('keeps the service price snapshot unchanged when the catalog price changes', async () => {
    mockCustomerExists();
    mockMeasurement();
    const catalogService = {
      serviceId: 'SRV-000001',
      name: 'Premium stitching',
      price: 125.5,
      isActive: true,
    };
    servicesService.findActiveByIds.mockResolvedValue([catalogService]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    fabricsService.deductStock.mockResolvedValue({
      fabricId: 'FAB-000001',
      pricePerUnit: 125.5,
    });
    const { order } = createOrderDocument();
    const { item } = createOrderItemDocument();
    orderModel.mockImplementation(() => order);
    orderItemModel.mockImplementation((data: Record<string, unknown>) => Object.assign(item, data));

    const result = await service.createOrder(validDto(), 'USR-000001');
    catalogService.price = 999;

    expect(result.items[0].serviceSnapshot).toEqual({
      serviceId: 'SRV-000001',
      name: 'Premium stitching',
      price: 125.5,
      quantity: 3,
      lineAmount: 376.5,
    });
  });

  it('rejects a missing customer', async () => {
    customerModel.exists.mockReturnValue({
      session: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });

    await expect(service.createOrder(validDto(), 'USR-000001')).rejects.toThrow(
      new NotFoundException('Customer not found'),
    );
  });

  it('rolls back when a referenced service is inactive', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockRejectedValue(
      new BadRequestException('Tailoring service SRV-000001 is inactive'),
    );

    await expect(service.createOrder(validDto(), 'USR-000001')).rejects.toThrow(
      new BadRequestException('Tailoring service SRV-000001 is inactive'),
    );
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(fabricsService.deductStock).not.toHaveBeenCalled();
  });

  it('rolls back when a referenced fabric is inactive', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    fabricsService.deductStock.mockRejectedValue(
      new BadRequestException('Fabric FAB-000001 is inactive'),
    );

    await expect(service.createOrder(validDto(), 'USR-000001')).rejects.toThrow(
      new BadRequestException('Fabric FAB-000001 is inactive'),
    );
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it('requires fabric ID and quantity together', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    const dto = validDto();
    delete (dto.items[0] as { fabricQuantity?: number }).fabricQuantity;

    await expect(service.createOrder(dto, 'USR-000001')).rejects.toThrow(
      new BadRequestException('fabricId and fabricQuantity must be provided together'),
    );
  });

  it('rejects a measurement belonging to another customer', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    fabricsService.deductStock.mockResolvedValue({
      fabricId: 'FAB-000001',
      pricePerUnit: 125.5,
    });
    mockMeasurement({ ...measurement, customerId: 'CUS-000002' } as MeasurementDocument);

    await expect(service.createOrder(validDto(), 'USR-000001')).rejects.toThrow(
      new BadRequestException('Measurement does not belong to the requested customer'),
    );
  });

  it('rejects a missing measurement', async () => {
    mockCustomerExists();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    fabricsService.deductStock.mockResolvedValue({ fabricId: 'FAB-000001' });
    mockMeasurement(null);

    await expect(service.createOrder(validDto(), 'USR-000001')).rejects.toThrow(
      new NotFoundException('Measurement not found'),
    );
  });

  it('rolls back if persistence fails after stock deduction', async () => {
    mockCustomerExists();
    mockMeasurement();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    fabricsService.deductStock.mockResolvedValue({
      fabricId: 'FAB-000001',
      pricePerUnit: 125.5,
    });
    const { order, save } = createOrderDocument();
    save.mockRejectedValue(new Error('write failed'));
    orderModel.mockImplementation(() => order);
    const { item } = createOrderItemDocument();
    orderItemModel.mockImplementation(() => item);

    await expect(service.createOrder(validDto(), 'USR-000001')).rejects.toThrow(
      'Unable to create order',
    );
    expect(fabricsService.deductStock).toHaveBeenCalledWith(
      'FAB-000001',
      1.25,
      'ORD-000007',
      'USR-000001',
      session,
      ['TAILORING_ATTACHED'],
    );
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('retrieves an order and its sorted items', async () => {
    const { order } = createOrderDocument();
    const { item } = createOrderItemDocument();
    orderModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(order) });
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([item]) });
    orderItemModel.find.mockReturnValue({ sort });

    await expect(service.getOrderByOrderId('ORD-000007')).resolves.toEqual({
      order,
      items: [item],
      paymentStatus: OrderPaymentStatus.UNPAID,
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
  });

  it('throws when an order is missing', async () => {
    orderModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.getOrderByOrderId('ORD-999999')).rejects.toThrow(
      new NotFoundException('Order not found'),
    );
  });

  it.each([
    [0, 1907.88, OrderPaymentStatus.UNPAID],
    [900, 1007.88, OrderPaymentStatus.PARTIALLY_PAID],
    [1907.88, 0, OrderPaymentStatus.PAID],
  ])(
    'reports %s payment status for a mixed order without recalculating its stored total',
    async (paidAmount, balanceAmount, paymentStatus) => {
      const { order } = createOrderDocument({
        totalAmount: 1907.88,
        paidAmount,
        balanceAmount,
      });
      orderModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(order) });
      orderItemModel.find.mockReturnValue({
        sort: () => ({ exec: jest.fn().mockResolvedValue([]) }),
      });

      await expect(service.getOrderByOrderId(order.orderId)).resolves.toEqual({
        order,
        items: [],
        paymentStatus,
      });
    },
  );

  it('retrieves and groups orders by customer without loading per-order items separately', async () => {
    const first = createOrderDocument({
      orderId: 'ORD-000001',
      paidAmount: 200,
      balanceAmount: 300,
    }).order;
    const second = createOrderDocument({
      orderId: 'ORD-000002',
      paidAmount: 500,
      balanceAmount: 0,
    }).order;
    const firstItem = createOrderItemDocument({ orderId: 'ORD-000001' }).item;
    orderModel.find.mockReturnValue({
      sort: () => ({ exec: jest.fn().mockResolvedValue([first, second]) }),
    });
    orderItemModel.find.mockReturnValue({
      sort: () => ({ exec: jest.fn().mockResolvedValue([firstItem]) }),
    });

    await expect(service.getOrdersByCustomerId('CUS-000001')).resolves.toEqual([
      {
        order: first,
        items: [firstItem],
        paymentStatus: OrderPaymentStatus.PARTIALLY_PAID,
      },
      { order: second, items: [], paymentStatus: OrderPaymentStatus.PAID },
    ]);
    expect(orderItemModel.find).toHaveBeenCalledWith({
      orderId: { $in: ['ORD-000001', 'ORD-000002'] },
    });
  });

  it('retrieves and groups all orders without loading per-order items separately', async () => {
    const first = createOrderDocument({
      orderId: 'ORD-000001',
      paidAmount: 200,
      balanceAmount: 300,
    }).order;
    const second = createOrderDocument({
      orderId: 'ORD-000002',
      paidAmount: 500,
      balanceAmount: 0,
    }).order;
    const firstItem = createOrderItemDocument({ orderId: 'ORD-000001' }).item;
    orderModel.find.mockReturnValue({
      sort: () => ({ limit: () => ({ exec: jest.fn().mockResolvedValue([first, second]) }) }),
    });
    orderItemModel.find.mockReturnValue({
      sort: () => ({ exec: jest.fn().mockResolvedValue([firstItem]) }),
    });

    await expect(service.getAllOrders()).resolves.toEqual({
      data: [
        {
          order: first,
          items: [firstItem],
          paymentStatus: OrderPaymentStatus.PARTIALLY_PAID,
        },
        { order: second, items: [], paymentStatus: OrderPaymentStatus.PAID },
      ],
      meta: {
        limit: 20,
        hasNextPage: false,
        nextCursor: null,
      },
    });
    expect(orderModel.find).toHaveBeenCalledWith({});
    expect(orderItemModel.find).toHaveBeenCalledWith({
      orderId: { $in: ['ORD-000001', 'ORD-000002'] },
    });
  });

  it('returns an empty list without loading order items when there are no orders', async () => {
    orderModel.find.mockReturnValue({
      sort: () => ({ limit: () => ({ exec: jest.fn().mockResolvedValue([]) }) }),
    });

    await expect(service.getAllOrders()).resolves.toEqual({
      data: [],
      meta: {
        limit: 20,
        hasNextPage: false,
        nextCursor: null,
      },
    });
    expect(orderItemModel.find).not.toHaveBeenCalled();
  });

  it('uses the cursor to retrieve the next page with a stable sort order', async () => {
    const first = createOrderDocument({
      orderId: 'ORD-000003',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      paidAmount: 500,
      balanceAmount: 0,
    }).order;
    const second = createOrderDocument({
      orderId: 'ORD-000002',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      paidAmount: 500,
      balanceAmount: 0,
    }).order;
    const third = createOrderDocument({
      orderId: 'ORD-000001',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      paidAmount: 500,
      balanceAmount: 0,
    }).order;
    const limit = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([first, second, third]),
    });
    orderModel.find.mockReturnValue({ sort: () => ({ limit }) });
    orderItemModel.find.mockReturnValue({
      sort: () => ({ exec: jest.fn().mockResolvedValue([]) }),
    });

    const result = await service.getAllOrders({ limit: 2 });

    expect(limit).toHaveBeenCalledWith(3);
    expect(orderModel.find).toHaveBeenCalledWith({});
    expect(result.data).toHaveLength(2);
    expect(result.meta.limit).toBe(2);
    expect(result.meta.hasNextPage).toBe(true);
    expect(typeof result.meta.nextCursor).toBe('string');

    const cursor = result.meta.nextCursor;
    const nextPageLimit = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([third]),
    });
    orderModel.find.mockReturnValue({ sort: () => ({ limit: nextPageLimit }) });

    await service.getAllOrders({ limit: 2, cursor: cursor! });

    expect(orderModel.find).toHaveBeenLastCalledWith({
      $or: [
        { createdAt: { $lt: second.createdAt } },
        {
          createdAt: second.createdAt,
          orderId: { $lt: second.orderId },
        },
      ],
    });
  });

  it.each([
    [OrderStatus.DRAFT, OrderStatus.CONFIRMED],
    [OrderStatus.DRAFT, OrderStatus.CANCELLED],
    [OrderStatus.READY, OrderStatus.DELIVERED],
  ])('allows status transition from %s to %s and records updatedBy', async (from, to) => {
    const { order, save } = createOrderDocument({ status: from });
    orderModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(order) });

    await expect(service.updateOrderStatus('ORD-000007', to, 'USR-000010')).resolves.toBe(order);
    expect(order.status).toBe(to);
    expect(order.updatedBy).toBe('USR-000010');
    expect(save).toHaveBeenCalled();
  });

  it('rejects an invalid status transition without saving', async () => {
    const { order, save } = createOrderDocument({ status: OrderStatus.DRAFT });
    orderModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(order) });

    await expect(
      service.updateOrderStatus('ORD-000007', OrderStatus.DELIVERED, 'USR-000010'),
    ).rejects.toThrow(
      new BadRequestException('Order status cannot transition from DRAFT to DELIVERED'),
    );
    expect(save).not.toHaveBeenCalled();
    expect(auditLogsService.record).not.toHaveBeenCalled();
  });

  it('audits order status changes in the same transaction', async () => {
    const { order, save } = createOrderDocument({ status: OrderStatus.DRAFT });
    orderModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(order) });

    await service.updateOrderStatus('ORD-000007', OrderStatus.CONFIRMED, 'USR-000010');

    expect(save).toHaveBeenCalledWith({ session });
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.STATUS_CHANGED,
        entityType: AuditEntityType.ORDER,
        entityId: 'ORD-000007',
        metadata: { from: OrderStatus.DRAFT, to: OrderStatus.CONFIRMED },
      }),
      session,
    );
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it('rolls back order creation when the audit write fails', async () => {
    mockCustomerExists();
    mockMeasurement();
    servicesService.findActiveByIds.mockResolvedValue([]);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    const { order } = createOrderDocument();
    const { item } = createOrderItemDocument();
    orderModel.mockImplementation((data: Record<string, unknown>) => Object.assign(order, data));
    orderItemModel.mockImplementation((data: Record<string, unknown>) => Object.assign(item, data));
    auditLogsService.record.mockRejectedValue(new Error('audit unavailable'));

    await expect(service.createOrder(validDto(), 'USR-000001')).rejects.toThrow(
      'Unable to create order',
    );
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });
});
