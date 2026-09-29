/// <reference types="jest" />

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Connection, Model } from 'mongoose';

import type { CustomerDocument } from '../customers/schemas/customer.schema';
import type { FabricsService } from '../fabrics/fabrics.service';
import { FabricType } from '../fabrics/enums/fabric-type.enum';
import { QuantityUnit } from '../fabrics/enums/quantity-unit.enum';
import type { MeasurementDocument } from '../measurements/schemas/measurement.schema';
import { ClothingType } from '../measurements/enums/clothing-type.enum';
import { FitPreference } from '../measurements/enums/fit-preference.enum';
import type { ServicesService } from '../services/services.service';
import type { CounterDocument } from '../users/schemas/counter.schema';
import { OrderStatus } from './enums/order-status.enum';
import type { OrderDocument } from './schemas/order.schema';
import type { OrderItemDocument } from './schemas/order-item.schema';
import { OrdersService } from './orders.service';

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
  let fabricsService: { deductStock: jest.Mock };
  let servicesService: { findActiveByIds: jest.Mock };
  let service: OrdersService;

  const createOrderDocument = (overrides: Partial<OrderDocument> = {}) => {
    const save = jest.fn();
    const order = {
      orderId: 'ORD-000007',
      customerId: 'CUS-000001',
      orderDate,
      status: OrderStatus.DRAFT,
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
    version: 2,
    measurements: new Map([
      ['chest', 40],
      ['waist', 36],
    ]),
    fitPreference: FitPreference.REGULAR,
    notes: 'measurement note',
    measuredAt: new Date('2025-12-20T00:00:00.000Z'),
  } as unknown as MeasurementDocument;

  const validDto = () => ({
    customerId: 'CUS-000001',
    orderDate,
    items: [
      {
        clothingType: ClothingType.SHIRT,
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
    fabricsService = { deductStock: jest.fn() };
    servicesService = { findActiveByIds: jest.fn() };
    service = new OrdersService(
      { startSession: jest.fn().mockResolvedValue(session) } as unknown as Connection,
      orderModel as unknown as Model<OrderDocument>,
      orderItemModel as unknown as Model<OrderItemDocument>,
      customerModel as unknown as Model<CustomerDocument>,
      measurementModel as unknown as Model<MeasurementDocument>,
      counterModel as unknown as Model<CounterDocument>,
      fabricsService as unknown as FabricsService,
      servicesService as unknown as ServicesService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockCustomerExists = () => {
    customerModel.exists.mockReturnValue({
      session: () => ({ exec: jest.fn().mockResolvedValue({ _id: 'customer-id' }) }),
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
    orderModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(order, data),
    );
    let capturedItemInput: Record<string, unknown> | undefined;
    orderItemModel.mockImplementation((data: Record<string, unknown>) => {
      capturedItemInput = data;
      return Object.assign(item, data);
    });

    const result = await service.createOrder(validDto(), 'USR-000009');

    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'order' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({ session }),
    );
    expect(servicesService.findActiveByIds).toHaveBeenCalledWith(
      ['SRV-000001'],
      session,
    );
    expect(fabricsService.deductStock).toHaveBeenCalledWith(
      'FAB-000001',
      1.25,
      'ORD-000007',
      'USR-000009',
      session,
    );
    expect(orderModel).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-000007',
        customerId: 'CUS-000001',
        createdBy: 'USR-000009',
        updatedBy: 'USR-000009',
      }),
    );
    expect(orderItemModel).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-000007',
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
        measurements: Map<string, number>;
      };
      fabricSnapshot: {
        fabricId: string;
        quantityUsed: number;
        pricePerUnit: number;
      };
    };
    expect(itemInput.measurementSnapshot.customerId).toBe('CUS-000001');
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
    expect(result).toEqual({ order, items: [item] });
  });

  it('rejects an order without items and rolls back', async () => {
    await expect(
      service.createOrder({ customerId: 'CUS-000001', orderDate, items: [] }, 'USR-000001'),
    ).rejects.toThrow(new BadRequestException('At least one order item is required'));
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('rejects invalid item quantities', async () => {
    const dto = validDto();
    dto.items[0].quantity = 0;

    await expect(service.createOrder(dto, 'USR-000001')).rejects.toThrow(
      new BadRequestException('Order service quantity must be a positive integer'),
    );
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
    fabricsService.deductStock.mockResolvedValue({ fabricId: 'FAB-000001' });
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
    fabricsService.deductStock.mockResolvedValue({ fabricId: 'FAB-000001' });
    const { order, save } = createOrderDocument();
    save.mockRejectedValue(new Error('write failed'));
    orderModel.mockImplementation(() => order);
    const { item } = createOrderItemDocument();
    orderItemModel.mockImplementation(() => item);

    await expect(service.createOrder(validDto(), 'USR-000001')).rejects.toThrow(
      'Unable to create order',
    );
    expect(fabricsService.deductStock).toHaveBeenCalled();
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
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
  });

  it('throws when an order is missing', async () => {
    orderModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.getOrderByOrderId('ORD-999999')).rejects.toThrow(
      new NotFoundException('Order not found'),
    );
  });

  it('retrieves and groups orders by customer without loading per-order items separately', async () => {
    const first = createOrderDocument({ orderId: 'ORD-000001' }).order;
    const second = createOrderDocument({ orderId: 'ORD-000002' }).order;
    const firstItem = createOrderItemDocument({ orderId: 'ORD-000001' }).item;
    orderModel.find.mockReturnValue({
      sort: () => ({ exec: jest.fn().mockResolvedValue([first, second]) }),
    });
    orderItemModel.find.mockReturnValue({
      sort: () => ({ exec: jest.fn().mockResolvedValue([firstItem]) }),
    });

    await expect(service.getOrdersByCustomerId('CUS-000001')).resolves.toEqual([
      { order: first, items: [firstItem] },
      { order: second, items: [] },
    ]);
    expect(orderItemModel.find).toHaveBeenCalledWith({
      orderId: { $in: ['ORD-000001', 'ORD-000002'] },
    });
  });

  it.each([
    [OrderStatus.DRAFT, OrderStatus.CONFIRMED],
    [OrderStatus.DRAFT, OrderStatus.CANCELLED],
    [OrderStatus.READY, OrderStatus.DELIVERED],
  ])('allows status transition from %s to %s and records updatedBy', async (from, to) => {
    const { order, save } = createOrderDocument({ status: from });
    orderModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(order) });

    await expect(service.updateOrderStatus('ORD-000007', to, 'USR-000010')).resolves.toBe(
      order,
    );
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
  });
});
