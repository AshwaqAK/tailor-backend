/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateGarmentTypeDto } from './create-garment-type.dto';
import { InputType } from '../enums/input-type.enum';
import { MeasurementUnit } from '../enums/measurement-unit.enum';
import { PricingType } from '../enums/pricing-type.enum';

describe('Garment type DTO validation', () => {
  const validGarmentType = () => ({
    name: 'Shirt',
    code: 'SHIRT',
    tailoringService: { serviceId: 'SRV-000001', basePrice: 750 },
    customizationGroups: [
      {
        name: 'Collar',
        sortOrder: 0,
        options: [
          {
            name: 'Spread',
            inputType: InputType.SINGLE_SELECT,
            price: 50,
            pricingType: PricingType.FIXED,
            sortOrder: 0,
          },
        ],
      },
    ],
    measurementFields: [
      { key: 'chest', name: 'Chest', unit: MeasurementUnit.INCH, required: true, sortOrder: 0 },
    ],
  });

  it('accepts valid nested garment type data', async () => {
    await expect(
      validate(plainToInstance(CreateGarmentTypeDto, validGarmentType())),
    ).resolves.toHaveLength(0);
  });

  it('rejects missing required fields', async () => {
    const errors = await validate(plainToInstance(CreateGarmentTypeDto, {}));

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'name',
        'code',
        'tailoringService',
        'customizationGroups',
        'measurementFields',
      ]),
    );
  });

  it('rejects invalid nested enum and price values', async () => {
    const value = validGarmentType();
    value.tailoringService.basePrice = -1;
    value.customizationGroups[0].options[0].inputType = 'INVALID' as InputType;
    value.measurementFields[0].unit = 'CM' as MeasurementUnit;

    const errors = await validate(plainToInstance(CreateGarmentTypeDto, value));

    expect(errors.length).toBeGreaterThan(0);
  });
});
