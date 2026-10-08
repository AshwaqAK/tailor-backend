/// <reference types="jest" />

import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Model } from 'mongoose';

import type { CustomerDocument } from '../customers/schemas/customer.schema';
import type { GarmentTypeDocument } from '../garment-types/schemas/garment-type.schema';
import { ClothingType } from './enums/clothing-type.enum';
import { FitPreference } from './enums/fit-preference.enum';
import { MeasurementUnit } from '../garment-types/enums/measurement-unit.enum';
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
    findById: jest.Mock;
    find: jest.Mock;
  };
  let customerModel: { exists: jest.Mock };
  let garmentTypeModel: { findOne: jest.Mock };
  let service: MeasurementsService;

  const createMeasurementDocument = (overrides: Partial<MeasurementDocument> = {}) => {
    const save = jest.fn();
    const set = jest.fn(function (this: Record<string, unknown>, path: string, value: unknown) {
      this[path] = value;
    });
    const measurement = {
      _id: { toString: () => 'measurement-object-id' },
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
      garmentTypeId: 'GRT-000001',
      version: 1,
      measurements: new Map([['chest', 40]]),
      fitPreference: FitPreference.REGULAR,
      measuredAt,
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
      set,
      save,
      ...overrides,
    } as unknown as MeasurementDocument;
    save.mockResolvedValue(measurement);

    return { measurement, save, set };
  };

  beforeEach(() => {
    measurementModel = Object.assign(jest.fn(), {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    });
    customerModel = { exists: jest.fn() };
    garmentTypeModel = { findOne: jest.fn() };
    garmentTypeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        garmentTypeId: 'GRT-000001',
        code: ClothingType.SHIRT,
        measurementFields: [
          { key: 'chest', name: 'Chest', unit: MeasurementUnit.INCH, required: true },
          { key: 'waist', name: 'Waist', unit: MeasurementUnit.INCH, required: false },
        ],
      }),
    });
    service = new MeasurementsService(
      measurementModel as unknown as Model<MeasurementDocument>,
      customerModel as unknown as Model<CustomerDocument>,
      garmentTypeModel as unknown as Model<GarmentTypeDocument>,
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
      garmentTypeId: 'GRT-000001',
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
      updatedBy: 'USR-000009',
    });
    expect(save).toHaveBeenCalled();
    expect(result.version).toBe(3);
    expect(result.createdBy).toBe('USR-000009');
  });

  it('creates a measurement with an existing garment type reference', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    garmentTypeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        garmentTypeId: 'GRT-000001',
        code: ClothingType.SHIRT,
        measurementFields: [
          { key: 'chest', name: 'Chest', unit: MeasurementUnit.INCH, required: true },
        ],
      }),
    });
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
        clothingType: ClothingType.SHIRT,
        garmentTypeId: 'GRT-000001',
        measurements: { chest: 40 },
        measuredAt,
      },
      'USR-000001',
    );

    expect(garmentTypeModel.findOne).toHaveBeenCalledWith({ garmentTypeId: 'GRT-000001' });
    expect(measurement.garmentTypeId).toBe('GRT-000001');
    expect(measurement.clothingType).toBe(ClothingType.SHIRT);
  });

  it('uses a new garment type code without rejecting it as a legacy clothing type', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    garmentTypeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        garmentTypeId: 'GRT-000008',
        code: 'SHERWANI',
        measurementFields: [
          { key: 'chest', name: 'Chest', unit: MeasurementUnit.INCH, required: true },
        ],
      }),
    });
    measurementModel.findOne.mockReturnValue({
      sort: () => ({
        select: () => ({
          lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
        }),
      }),
    });
    const { measurement } = createMeasurementDocument();
    let capturedData: Record<string, unknown> | undefined;
    measurementModel.mockImplementation((data: Record<string, unknown>) =>
      ((capturedData = data), Object.assign(measurement, data)),
    );

    await service.createMeasurement(
      {
        customerId: 'CUS-000001',
        garmentTypeId: 'GRT-000008',
        measurements: { chest: 40 },
        measuredAt,
      },
      'USR-000001',
    );

    expect(measurementModel.findOne).toHaveBeenCalledWith({
      customerId: 'CUS-000001',
      garmentTypeId: 'GRT-000008',
    });
    expect(measurement.garmentTypeId).toBe('GRT-000008');
    expect(capturedData).not.toHaveProperty('clothingType');
  });

  it('rejects an unknown configured measurement field', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });

    await expect(
      service.createMeasurement(
        {
          customerId: 'CUS-000001',
          garmentTypeId: 'GRT-000001',
          measurements: { chest: 40, sleeve: 25 },
          measuredAt,
        },
        'USR-000001',
      ),
    ).rejects.toThrow(new BadRequestException('Unknown measurement field: sleeve'));
  });

  it('rejects a missing required measurement field', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });

    await expect(
      service.createMeasurement(
        {
          customerId: 'CUS-000001',
          garmentTypeId: 'GRT-000001',
          measurements: {},
          measuredAt,
        },
        'USR-000001',
      ),
    ).rejects.toThrow(new BadRequestException('Missing required measurement field: chest'));
  });

  it('rejects a non-numeric measurement value', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });

    await expect(
      service.createMeasurement(
        {
          customerId: 'CUS-000001',
          garmentTypeId: 'GRT-000001',
          measurements: { chest: Number.NaN },
          measuredAt,
        },
        'USR-000001',
      ),
    ).rejects.toThrow(new BadRequestException('Invalid measurement value for field: chest'));
  });

  it('versions measurements independently for each garment type', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    garmentTypeModel.findOne.mockImplementation(({ garmentTypeId }: { garmentTypeId: string }) => ({
      exec: jest.fn().mockResolvedValue({
        garmentTypeId,
        code: garmentTypeId === 'GRT-000008' ? 'SHERWANI' : ClothingType.SHIRT,
        measurementFields: [
          { key: 'chest', name: 'Chest', unit: MeasurementUnit.INCH, required: true },
        ],
      }),
    }));
    measurementModel.findOne.mockImplementation(
      ({ garmentTypeId }: { garmentTypeId: string }) => ({
        sort: () => ({
          select: () => ({
            lean: () => ({
              exec: jest.fn().mockResolvedValue(
                garmentTypeId === 'GRT-000001' ? { version: 2 } : null,
              ),
            }),
          }),
        }),
      }),
    );
    const documents: Record<string, unknown>[] = [];
    measurementModel.mockImplementation((data: Record<string, unknown>) => {
      documents.push(data);
      return { ...data, save: jest.fn().mockResolvedValue(data) };
    });

    await service.createMeasurement(
      {
        customerId: 'CUS-000001',
        garmentTypeId: 'GRT-000001',
        measurements: { chest: 40 },
        measuredAt,
      },
      'USR-000001',
    );
    await service.createMeasurement(
      {
        customerId: 'CUS-000001',
        garmentTypeId: 'GRT-000008',
        measurements: { chest: 40 },
        measuredAt,
      },
      'USR-000001',
    );

    expect(measurementModel.findOne).toHaveBeenNthCalledWith(1, {
      customerId: 'CUS-000001',
      garmentTypeId: 'GRT-000001',
    });
    expect(measurementModel.findOne).toHaveBeenNthCalledWith(2, {
      customerId: 'CUS-000001',
      garmentTypeId: 'GRT-000008',
    });
    expect(documents.map((document) => document.version)).toEqual([3, 1]);
  });

  it('rejects a measurement with a missing garment type reference', async () => {
    customerModel.exists.mockResolvedValue({ _id: 'customer-object-id' });
    garmentTypeModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(
      service.createMeasurement(
        {
        customerId: 'CUS-000001',
        clothingType: ClothingType.SHIRT,
          garmentTypeId: 'GRT-999999',
          measurements: { chest: 40 },
          measuredAt,
        },
        'USR-000001',
      ),
    ).rejects.toThrow(new NotFoundException('Garment type not found'));
    expect(measurementModel).not.toHaveBeenCalled();
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
        garmentTypeId: 'GRT-000002',
        measurements: { chest: 40 },
        measuredAt,
      },
      'USR-000001',
    );

    expect(measurementModel).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });

  it('updates only supplied measurement fields and records the updating user', async () => {
    const { measurement, save, set } = createMeasurementDocument();
    measurementModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(measurement),
    });

    const result = await service.updateMeasurement(
      'measurement-object-id',
      {
        measurements: { chest: 42, waist: 37 },
        fitPreference: FitPreference.LOOSE,
        notes: 'Allow extra room',
      },
      'USR-000009',
    );

    expect(measurementModel.findById).toHaveBeenCalledWith('measurement-object-id');
    expect(set).toHaveBeenCalledWith('measurements', {
      chest: 42,
      waist: 37,
    });
    expect(measurement.fitPreference).toBe(FitPreference.LOOSE);
    expect(measurement.notes).toBe('Allow extra room');
    expect(measurement.updatedBy).toBe('USR-000009');
    expect(save).toHaveBeenCalled();
    expect(result).toBe(measurement);
  });

  it('validates a changed customer before updating a measurement', async () => {
    const { measurement } = createMeasurementDocument();
    measurementModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(measurement),
    });
    customerModel.exists.mockResolvedValue({ _id: 'new-customer-object-id' });

    await service.updateMeasurement(
      'measurement-object-id',
      { customerId: 'CUS-000002' },
      'USR-000009',
    );

    expect(customerModel.exists).toHaveBeenCalledWith({ customerId: 'CUS-000002' });
    expect(measurement.customerId).toBe('CUS-000002');
  });

  it('throws when the measurement being updated does not exist', async () => {
    measurementModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.updateMeasurement('missing-measurement-id', { notes: 'Updated' }, 'USR-000009'),
    ).rejects.toThrow(new NotFoundException('Measurement not found'));
  });

  it('rejects creation when the customer does not exist', async () => {
    customerModel.exists.mockResolvedValue(null);

    await expect(
      service.createMeasurement(
        {
        customerId: 'CUS-999999',
        clothingType: ClothingType.SHIRT,
        garmentTypeId: 'GRT-000001',
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
          garmentTypeId: 'GRT-000001',
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
