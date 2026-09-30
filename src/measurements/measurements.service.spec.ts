/// <reference types="jest" />

import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Model } from 'mongoose';

import type { CustomerDocument } from '../customers/schemas/customer.schema';
import { ClothingType } from './enums/clothing-type.enum';
import { FitPreference } from './enums/fit-preference.enum';
import type { MeasurementDocument } from './schemas/measurement.schema';
import { MeasurementsService } from './measurements.service';

jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('MeasurementsService', () => {
  const measuredAt = new Date('2026-01-01T00:00:00.000Z');
  let measurementModel: jest.Mock & {
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let customerModel: { exists: jest.Mock };
  let service: MeasurementsService;

  const createMeasurementDocument = (overrides: Partial<MeasurementDocument> = {}) => {
    const save = jest.fn();
    const measurement = {
      _id: { toString: () => 'measurement-object-id' },
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
      version: 1,
      measurements: new Map([['chest', 40]]),
      fitPreference: FitPreference.REGULAR,
      measuredAt,
      createdBy: 'USR-000001',
      save,
      ...overrides,
    } as unknown as MeasurementDocument;
    save.mockResolvedValue(measurement);

    return { measurement, save };
  };

  beforeEach(() => {
    measurementModel = Object.assign(jest.fn(), {
      findOne: jest.fn(),
      find: jest.fn(),
    });
    customerModel = { exists: jest.fn() };
    service = new MeasurementsService(
      measurementModel as unknown as Model<MeasurementDocument>,
      customerModel as unknown as Model<CustomerDocument>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a measurement for an existing customer with the next version', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    measurementModel.findOne.mockReturnValue({
      sort: () => ({
        select: () => ({
          lean: () => ({ exec: jest.fn().mockResolvedValue({ version: 2 }) }),
        }),
      }),
    });
    const { measurement, save } = createMeasurementDocument({ version: 3 });
    measurementModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(measurement, data),
    );
    const dto = {
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
      measurements: { chest: 40, waist: 36 },
      fitPreference: FitPreference.REGULAR,
      measuredAt,
    };

    const result = await service.createMeasurement(dto, 'USR-000009');

    expect(customerModel.exists).toHaveBeenCalledWith({ customerId: 'CUS-000001' });
    expect(measurementModel).toHaveBeenCalledWith({
      ...dto,
      notes: undefined,
      version: 3,
      createdBy: 'USR-000009',
    });
    expect(save).toHaveBeenCalled();
    expect(result.version).toBe(3);
    expect(result.createdBy).toBe('USR-000009');
  });

  it('starts measurement versions at one', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    measurementModel.findOne.mockReturnValue({
      sort: () => ({
        select: () => ({
          lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
        }),
      }),
    });
    const { measurement } = createMeasurementDocument();
    measurementModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(measurement, data),
    );

    await service.createMeasurement(
      {
        customerId: 'CUS-000001',
        clothingType: ClothingType.KURTA,
        measurements: { chest: 40 },
        measuredAt,
      },
      'USR-000001',
    );

    expect(measurementModel).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });

  it('rejects creation when the customer does not exist', async () => {
    customerModel.exists.mockResolvedValue(null);

    await expect(
      service.createMeasurement(
        {
          customerId: 'CUS-999999',
          clothingType: ClothingType.SHIRT,
          measurements: { chest: 40 },
          measuredAt,
        },
        'USR-000001',
      ),
    ).rejects.toThrow(new NotFoundException('Customer not found'));
    expect(measurementModel).not.toHaveBeenCalled();
  });

  it('returns the latest measurement for an existing customer', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    const { measurement } = createMeasurementDocument({ version: 4 });
    const exec = jest.fn().mockResolvedValue(measurement);
    const sort = jest.fn().mockReturnValue({ exec });
    measurementModel.findOne.mockReturnValue({ sort });

    await expect(service.getLatestMeasurement('CUS-000001', ClothingType.SHIRT)).resolves.toBe(
      measurement,
    );
    expect(measurementModel.findOne).toHaveBeenCalledWith({
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
    });
    expect(sort).toHaveBeenCalledWith({ version: -1 });
  });

  it('throws when the requested measurement is missing', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    measurementModel.findOne.mockReturnValue({
      sort: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });

    await expect(service.getLatestMeasurement('CUS-000001', ClothingType.BLAZER)).rejects.toThrow(
      new NotFoundException('Measurement not found'),
    );
  });

  it('returns all measurements for a customer using database sorting', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    const { measurement } = createMeasurementDocument();
    const exec = jest.fn().mockResolvedValue([measurement]);
    const sort = jest.fn().mockReturnValue({ exec });
    measurementModel.find.mockReturnValue({ sort });

    await expect(service.getMeasurementsByCustomer('CUS-000001')).resolves.toEqual([measurement]);
    expect(measurementModel.find).toHaveBeenCalledWith({ customerId: 'CUS-000001' });
    expect(sort).toHaveBeenCalledWith({ clothingType: 1, version: -1 });
  });

  it('maps duplicate version errors to a conflict exception', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    measurementModel.findOne.mockReturnValue({
      sort: () => ({
        select: () => ({
          lean: () => ({ exec: jest.fn().mockResolvedValue({ version: 1 }) }),
        }),
      }),
    });
    const { measurement, save } = createMeasurementDocument();
    save.mockRejectedValue({ code: 11000 });
    measurementModel.mockImplementation(() => measurement);

    await expect(
      service.createMeasurement(
        {
          customerId: 'CUS-000001',
          clothingType: ClothingType.SHIRT,
          measurements: { chest: 40 },
          measuredAt,
        },
        'USR-000001',
      ),
    ).rejects.toThrow(new ConflictException('A measurement with this version already exists'));
  });

  it('does not expose unexpected persistence errors', async () => {
    customerModel.exists.mockRejectedValue(new Error('database details'));

    await expect(service.getMeasurementsByCustomer('CUS-000001')).rejects.toThrow(
      new InternalServerErrorException('Unable to complete the measurement operation'),
    );
  });
});
