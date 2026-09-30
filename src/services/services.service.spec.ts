/// <reference types="jest" />

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Connection, Model } from 'mongoose';

import type { CounterDocument } from '../users/schemas/counter.schema';
import { ServiceCategory } from './enums/service-category.enum';
import type { TailoringServiceDocument } from './schemas/tailoring-service.schema';
import { ServicesService } from './services.service';
import { ServiceQueryDto } from './dto/service-query.dto';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('ServicesService', () => {
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let connection: { startSession: jest.Mock };
  let tailoringServiceModel: jest.Mock & {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOne: jest.Mock;
    findOneAndDelete: jest.Mock;
  };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let service: ServicesService;

  const validDto = () => ({
    name: 'Premium Stitching',
    category: ServiceCategory.STITCHING,
    price: 750.5,
    description: 'Premium garment stitching',
  });

  const createServiceDocument = (
    overrides: Partial<TailoringServiceDocument> = {},
  ) => {
    const save = jest.fn();
    const tailoringService = {
      serviceId: 'SRV-000007',
      ...validDto(),
      isActive: true,
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
      save,
      ...overrides,
    } as unknown as TailoringServiceDocument;
    save.mockResolvedValue(tailoringService);
    return { tailoringService, save };
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
    tailoringServiceModel = Object.assign(jest.fn(), {
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOne: jest.fn(),
      findOneAndDelete: jest.fn(),
    });
    counterModel = { findOneAndUpdate: jest.fn() };
    service = new ServicesService(
      connection as unknown as Connection,
      tailoringServiceModel as unknown as Model<TailoringServiceDocument>,
      counterModel as unknown as Model<CounterDocument>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a tailoring service with a generated ID and audit fields', async () => {
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    const { tailoringService, save } = createServiceDocument();
    tailoringServiceModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(tailoringService, data),
    );

    const result = await service.create(validDto(), 'USR-000009');

    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'service' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session,
      }),
    );
    expect(tailoringServiceModel).toHaveBeenCalledWith({
      ...validDto(),
      serviceId: 'SRV-000007',
      createdBy: 'USR-000009',
      updatedBy: 'USR-000009',
    });
    expect(save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(result.serviceId).toBe('SRV-000007');
  });

  it.each([
    [{ price: -0.01 }, 'Tailoring service price must be a non-negative number'],
    [{ category: 'INVALID' }, 'Invalid tailoring service category'],
  ])('rejects invalid catalog values before opening a transaction', async (value, message) => {
    await expect(
      service.create(
        { ...validDto(), ...value } as Parameters<ServicesService['create']>[0],
        'USR-000001',
      ),
    ).rejects.toThrow(new BadRequestException(message));
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('returns all services with default sorting and pagination', async () => {
    const { tailoringService } = createServiceDocument();
    const exec = jest.fn().mockResolvedValue([tailoringService]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    tailoringServiceModel.find.mockReturnValue({ sort });
    tailoringServiceModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });

    const result = await service.findAll(new ServiceQueryDto());

    expect(tailoringServiceModel.find).toHaveBeenCalledWith({});
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: [tailoringService],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('applies escaped filters, sorting, and requested pagination', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    tailoringServiceModel.find.mockReturnValue({ sort });
    tailoringServiceModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(21),
    });
    const query = {
      page: 3,
      limit: 10,
      name: 'Stitching.*',
      category: ServiceCategory.STITCHING,
      isActive: false,
      sortBy: 'price' as const,
      sortOrder: 'asc' as const,
    };

    const result = await service.findAll(query);

    const expectedFilter = {
      name: { $regex: 'Stitching\\.\\*', $options: 'i' },
      category: ServiceCategory.STITCHING,
      isActive: false,
    };
    expect(tailoringServiceModel.find).toHaveBeenCalledWith(expectedFilter);
    expect(tailoringServiceModel.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(sort).toHaveBeenCalledWith({ price: 1 });
    expect(skip).toHaveBeenCalledWith(20);
    expect(limit).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({ page: 3, limit: 10, total: 21, totalPages: 3 });
  });

  it('finds one service by its generated ID', async () => {
    const { tailoringService } = createServiceDocument();
    tailoringServiceModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(tailoringService),
    });

    await expect(service.findOne('SRV-000007')).resolves.toBe(tailoringService);
    expect(tailoringServiceModel.findOne).toHaveBeenCalledWith({
      serviceId: 'SRV-000007',
    });
  });

  it('throws when a service is missing', async () => {
    tailoringServiceModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.findOne('SRV-999999')).rejects.toThrow(
      new NotFoundException('Tailoring service not found'),
    );
  });

  it('updates mutable fields and records updatedBy without changing immutable fields', async () => {
    const { tailoringService, save } = createServiceDocument();
    tailoringServiceModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(tailoringService),
    });
    const update = {
      name: 'Express Alteration',
      category: ServiceCategory.ALTERATION,
      price: 300,
      description: 'Same-day alteration',
      isActive: false,
    };

    const result = await service.update('SRV-000007', update, 'USR-000010');

    expect(save).toHaveBeenCalledWith();
    expect(result).toMatchObject({
      ...update,
      serviceId: 'SRV-000007',
      createdBy: 'USR-000001',
      updatedBy: 'USR-000010',
    });
  });

  it('deletes a service by ID', async () => {
    const { tailoringService } = createServiceDocument();
    tailoringServiceModel.findOneAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(tailoringService),
    });

    await expect(service.remove('SRV-000007')).resolves.toBe(tailoringService);
    expect(tailoringServiceModel.findOneAndDelete).toHaveBeenCalledWith({
      serviceId: 'SRV-000007',
    });
  });

  it('throws when deleting a missing service', async () => {
    tailoringServiceModel.findOneAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(service.remove('SRV-999999')).rejects.toThrow(
      new NotFoundException('Tailoring service not found'),
    );
  });

  it('returns active services in requested order and uses the supplied session', async () => {
    const first = createServiceDocument({ serviceId: 'SRV-000001' }).tailoringService;
    const second = createServiceDocument({ serviceId: 'SRV-000002' }).tailoringService;
    const query = {
      session: jest.fn(),
      exec: jest.fn().mockResolvedValue([second, first]),
    };
    query.session.mockReturnValue(query);
    tailoringServiceModel.find.mockReturnValue(query);

    const result = await service.findActiveByIds(
      ['SRV-000001', 'SRV-000002', 'SRV-000001'],
      session as never,
    );

    expect(tailoringServiceModel.find).toHaveBeenCalledWith({
      serviceId: { $in: ['SRV-000001', 'SRV-000002'] },
    });
    expect(query.session).toHaveBeenCalledWith(session);
    expect(result).toEqual([first, second]);
  });

  it('rejects a missing requested service', async () => {
    const query = {
      exec: jest.fn().mockResolvedValue([]),
    };
    tailoringServiceModel.find.mockReturnValue(query);

    await expect(service.findActiveByIds(['SRV-999999'])).rejects.toThrow(
      new NotFoundException('Tailoring service SRV-999999 not found'),
    );
  });

  it('rejects an inactive requested service', async () => {
    const inactive = createServiceDocument({
      serviceId: 'SRV-000001',
      isActive: false,
    }).tailoringService;
    const query = {
      exec: jest.fn().mockResolvedValue([inactive]),
    };
    tailoringServiceModel.find.mockReturnValue(query);

    await expect(service.findActiveByIds(['SRV-000001'])).rejects.toThrow(
      new BadRequestException('Tailoring service SRV-000001 is inactive'),
    );
  });
});
