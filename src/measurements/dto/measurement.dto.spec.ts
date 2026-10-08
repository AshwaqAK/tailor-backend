/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateMeasurementDto } from './create-measurement.dto';
import { ClothingType } from '../enums/clothing-type.enum';

describe('Measurement DTO validation', () => {
  it('accepts finite numeric measurement values', async () => {
    const dto = plainToInstance(CreateMeasurementDto, {
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
      garmentTypeId: 'GRT-000001',
      version: 1,
      measurements: { chest: 40, waist: 35.5 },
      measuredAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts a valid database-driven garment type ID', async () => {
    const dto = plainToInstance(CreateMeasurementDto, {
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
      garmentTypeId: 'GRT-000001',
      version: 1,
      measurements: { chest: 40 },
      measuredAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an invalid garment type ID', async () => {
    const dto = plainToInstance(CreateMeasurementDto, {
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
      garmentTypeId: 'GARMENT-1',
      version: 1,
      measurements: { chest: 40 },
      measuredAt: '2026-01-01T00:00:00.000Z',
    });

    expect((await validate(dto)).map((error) => error.property)).toContain('garmentTypeId');
  });

  it('rejects non-numeric and non-finite measurement values', async () => {
    const dto = plainToInstance(CreateMeasurementDto, {
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
      version: 1,
      measurements: { chest: 'forty', waist: Number.POSITIVE_INFINITY },
      measuredAt: '2026-01-01T00:00:00.000Z',
    });
    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'measurements')).toBeDefined();
  });

  it('rejects missing required fields', async () => {
    const errors = await validate(plainToInstance(CreateMeasurementDto, {}));

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'customerId',
        'garmentTypeId',
        'version',
        'measurements',
        'measuredAt',
      ]),
    );
  });
});
