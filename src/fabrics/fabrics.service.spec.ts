/// <reference types="jest" />

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ClientSession, Connection, Model } from 'mongoose';

import type { CounterDocument } from '../users/schemas/counter.schema';
import { FabricQueryDto } from './dto/fabric-query.dto';
import { FabricType } from './enums/fabric-type.enum';
import { QuantityUnit } from './enums/quantity-unit.enum';
import type { FabricDocument } from './schemas/fabric.schema';
import { FabricsService } from './fabrics.service';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('FabricsService', () => {
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let connection: { startSession: jest.Mock };
  let fabricModel: jest.Mock & {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findOneAndDelete: jest.Mock;
  };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let service: FabricsService;

  const validDto = () => ({
    name: 'Premium Cotton',
    type: FabricType.COTTON,
    color: 'Navy Blue',
    quantity: 10.5,
    unit: QuantityUnit.METER,
    pricePerUnit: 250,
    supplier: 'Textile House',
    description: 'Fine weave',
  });

  const createFabricDocument = (overrides: Partial<FabricDocument> = {}) => {
    const save = jest.fn();
    const fabric = {
      fabricId: 'FAB-000007',
      ...validDto(),
      isActive: true,
      stockDeductedOrderIds: [],
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
      save,
      ...overrides,
    } as unknown as FabricDocument;
    save.mockResolvedValue(fabric);
    return { fabric, save };
  };

  const createFallbackQuery = (result: FabricDocument | null) => {
    const query = {
      select: jest.fn(),
      session: jest.fn(),
      exec: jest.fn().mockResolvedValue(result),
    };
    query.select.mockReturnValue(query);
    query.session.mockReturnValue(query);
    return query;
  };

  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(true),
      endSession: jest.fn(),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    fabricModel = Object.assign(jest.fn(), {
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn(),
    });
    counterModel = { findOneAndUpdate: jest.fn() };
    service = new FabricsService(
      connection as unknown as Connection,
      fabricModel as unknown as Model<FabricDocument>,
      counterModel as unknown as Model<CounterDocument>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a fabric with a generated ID and authenticated-user audit fields', async () => {
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    const { fabric, save } = createFabricDocument();
    fabricModel.mockImplementation((data: Record<string, unknown>) => Object.assign(fabric, data));

    const result = await service.create(validDto(), 'USR-000009');

    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'fabric' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session,
      }),
    );
    expect(fabricModel).toHaveBeenCalledWith({
      ...validDto(),
      fabricId: 'FAB-000007',
      createdBy: 'USR-000009',
      updatedBy: 'USR-000009',
    });
    expect(save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(result.fabricId).toBe('FAB-000007');
  });

  it.each([
    [{ quantity: -1 }, 'Fabric quantity must be a non-negative number'],
    [{ pricePerUnit: -0.01 }, 'Fabric price per unit must be a non-negative number'],
    [{ type: 'INVALID' }, 'Invalid fabric type'],
    [{ unit: 'YARD' }, 'Invalid fabric quantity unit'],
  ])('rejects invalid fabric values before opening a transaction', async (value, message) => {
    await expect(
      service.create(
        { ...validDto(), ...value } as Parameters<FabricsService['create']>[0],
        'USR-000001',
      ),
    ).rejects.toThrow(new BadRequestException(message));
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('returns all fabrics with default sorting and pagination', async () => {
    const { fabric } = createFabricDocument();
    const exec = jest.fn().mockResolvedValue([fabric]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    fabricModel.find.mockReturnValue({ sort });
    fabricModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

    const result = await service.findAll(new FabricQueryDto());

    expect(fabricModel.find).toHaveBeenCalledWith({});
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: [fabric],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('applies escaped filters, sorting, and requested pagination', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    fabricModel.find.mockReturnValue({ sort });
    fabricModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(21) });
    const query = {
      page: 3,
      limit: 10,
      name: 'Cotton.*',
      type: FabricType.COTTON,
      color: 'Blue+',
      unit: QuantityUnit.METER,
      isActive: false,
      sortBy: 'quantity' as const,
      sortOrder: 'asc' as const,
    };

    const result = await service.findAll(query);

    const expectedFilter = {
      name: { $regex: 'Cotton\\.\\*', $options: 'i' },
      type: FabricType.COTTON,
      color: { $regex: 'Blue\\+', $options: 'i' },
      unit: QuantityUnit.METER,
      isActive: false,
    };
    expect(fabricModel.find).toHaveBeenCalledWith(expectedFilter);
    expect(fabricModel.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(sort).toHaveBeenCalledWith({ quantity: 1 });
    expect(skip).toHaveBeenCalledWith(20);
    expect(limit).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({ page: 3, limit: 10, total: 21, totalPages: 3 });
  });

  it('finds one fabric by its generated ID', async () => {
    const { fabric } = createFabricDocument();
    fabricModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(fabric) });

    await expect(service.findOne('FAB-000007')).resolves.toBe(fabric);
    expect(fabricModel.findOne).toHaveBeenCalledWith({ fabricId: 'FAB-000007' });
  });

  it('throws when a fabric is missing', async () => {
    fabricModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.findOne('FAB-999999')).rejects.toThrow(
      new NotFoundException('Fabric not found'),
    );
  });

  it('updates mutable fields and records updatedBy without changing immutable fields', async () => {
    const { fabric, save } = createFabricDocument();
    fabricModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(fabric) });
    const update = {
      name: 'Updated Silk',
      type: FabricType.SILK,
      color: 'Gold',
      quantity: 4,
      unit: QuantityUnit.PIECE,
      pricePerUnit: 500,
      supplier: 'New Supplier',
      description: 'Updated description',
      isActive: false,
    };

    const result = await service.update('FAB-000007', update, 'USR-000010');

    expect(save).toHaveBeenCalledWith();
    expect(result).toMatchObject({
      ...update,
      fabricId: 'FAB-000007',
      createdBy: 'USR-000001',
      updatedBy: 'USR-000010',
    });
  });

  it('deletes a fabric by ID', async () => {
    const { fabric } = createFabricDocument();
    fabricModel.findOneAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(fabric),
    });

    await expect(service.remove('FAB-000007')).resolves.toBe(fabric);
    expect(fabricModel.findOneAndDelete).toHaveBeenCalledWith({
      fabricId: 'FAB-000007',
    });
  });

  it('throws when deleting a missing fabric', async () => {
    fabricModel.findOneAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(service.remove('FAB-999999')).rejects.toThrow(
      new NotFoundException('Fabric not found'),
    );
  });

  describe('stock deduction', () => {
    const orderSession = {} as ClientSession;

    it('deducts stock atomically within the supplied transaction session', async () => {
      const { fabric } = createFabricDocument({ quantity: 8 });
      fabricModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(fabric),
      });

      await expect(
        service.deductStock('FAB-000007', 2.5, 'ORD-000001', 'USR-000011', orderSession),
      ).resolves.toBe(fabric);
      expect(fabricModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(fabricModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          fabricId: 'FAB-000007',
          isActive: true,
          quantity: { $gte: 2.5 },
          stockDeductedOrderIds: { $ne: 'ORD-000001' },
        },
        {
          $inc: { quantity: -2.5 },
          $addToSet: { stockDeductedOrderIds: 'ORD-000001' },
          $set: { updatedBy: 'USR-000011' },
        },
        { new: true, runValidators: true, session: orderSession },
      );
    });

    it.each([0, -1])('rejects a non-positive stock quantity of %s', async (quantity) => {
      await expect(
        service.deductStock('FAB-000007', quantity, 'ORD-000001', 'USR-000001', orderSession),
      ).rejects.toThrow(new BadRequestException('Fabric quantity to deduct must be positive'));
      expect(fabricModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects insufficient stock without issuing an unguarded decrement', async () => {
      const { fabric } = createFabricDocument({
        quantity: 1,
        stockDeductedOrderIds: [],
      });
      fabricModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      fabricModel.findOne.mockReturnValue(createFallbackQuery(fabric));

      await expect(
        service.deductStock('FAB-000007', 2, 'ORD-000001', 'USR-000001', orderSession),
      ).rejects.toThrow(new BadRequestException('Insufficient stock for fabric FAB-000007'));
      expect(fabricModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(fabricModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: { $gte: 2 } }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('rejects an inactive fabric after the guarded update misses', async () => {
      const { fabric } = createFabricDocument({
        isActive: false,
        stockDeductedOrderIds: [],
      });
      fabricModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      fabricModel.findOne.mockReturnValue(createFallbackQuery(fabric));

      await expect(
        service.deductStock('FAB-000007', 2, 'ORD-000001', 'USR-000001', orderSession),
      ).rejects.toThrow(new BadRequestException('Fabric FAB-000007 is inactive'));
    });

    it('returns the existing fabric without a second deduction for a repeated order', async () => {
      const { fabric } = createFabricDocument({
        quantity: 8,
        stockDeductedOrderIds: ['ORD-000001'],
      });
      fabricModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const fallbackQuery = createFallbackQuery(fabric);
      fabricModel.findOne.mockReturnValue(fallbackQuery);

      await expect(
        service.deductStock('FAB-000007', 2, 'ORD-000001', 'USR-000001', orderSession),
      ).resolves.toBe(fabric);
      expect(fabricModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(fallbackQuery.select).toHaveBeenCalledWith('+stockDeductedOrderIds');
      expect(fallbackQuery.session).toHaveBeenCalledWith(orderSession);
    });

    it('reports a missing fabric when the guarded update and fallback lookup miss', async () => {
      fabricModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      fabricModel.findOne.mockReturnValue(createFallbackQuery(null));

      await expect(
        service.deductStock('FAB-999999', 2, 'ORD-000001', 'USR-000001', orderSession),
      ).rejects.toThrow(new NotFoundException('Fabric FAB-999999 not found'));
    });
  });
});
