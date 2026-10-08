/// <reference types="jest" />

import { BadRequestException } from '@nestjs/common';

import { InputType } from './enums/input-type.enum';
import { PricingType } from './enums/pricing-type.enum';
import { GarmentTypePricingService } from './garment-type-pricing.service';

describe('GarmentTypePricingService', () => {
  let pricingService: GarmentTypePricingService;

  const garmentType = (groups: unknown[] = []) =>
    ({
      tailoringService: { basePrice: 100 },
      customizationGroups: groups,
    }) as never;

  const option = (name: string, inputType: InputType, price: number, pricingType: PricingType) => ({
    name,
    inputType,
    price,
    pricingType,
    sortOrder: 0,
  });

  beforeEach(() => {
    pricingService = new GarmentTypePricingService();
  });

  it('calculates base price only', () => {
    expect(pricingService.calculateTailoringTotal(garmentType(), {}, 1)).toBe(100);
  });

  it('adds a fixed customization charge', () => {
    const groups = [
      {
        name: 'Collar',
        sortOrder: 0,
        options: [option('Spread', InputType.SINGLE_SELECT, 25, PricingType.FIXED)],
      },
    ];

    expect(pricingService.calculateTailoringTotal(garmentType(groups), { Collar: 'Spread' }, 1)).toBe(
      125,
    );
  });

  it('adds multiple selected customization options', () => {
    const groups = [
      {
        name: 'Details',
        sortOrder: 0,
        options: [
          option('Pocket', InputType.MULTI_SELECT, 10, PricingType.FIXED),
          option('Cuff', InputType.MULTI_SELECT, 15, PricingType.FIXED),
        ],
      },
    ];

    expect(
      pricingService.calculateTailoringTotal(garmentType(groups), {
        Details: ['Pocket', 'Cuff'],
      }, 1),
    ).toBe(125);
  });

  it('multiplies per-unit pricing by the submitted numeric quantity', () => {
    const groups = [
      {
        name: 'Embroidery',
        sortOrder: 0,
        options: [option('Stitches', InputType.NUMBER, 5, PricingType.PER_UNIT)],
      },
    ];

    expect(
      pricingService.calculateTailoringTotal(garmentType(groups), { Embroidery: 3 }, 1),
    ).toBe(115);
  });

  it('rejects unknown groups and options', () => {
    const groups = [
      {
        name: 'Collar',
        sortOrder: 0,
        options: [option('Spread', InputType.SINGLE_SELECT, 25, PricingType.FIXED)],
      },
    ];

    expect(() => pricingService.calculateTailoringTotal(garmentType(groups), { Sleeve: 'Short' }, 1)).toThrow(
      new BadRequestException('Unknown customization group: Sleeve'),
    );
    expect(() => pricingService.calculateTailoringTotal(garmentType(groups), { Collar: 'Mandarin' }, 1)).toThrow(
      new BadRequestException('Unknown customization option: Mandarin in group Collar'),
    );
  });

  it('rejects invalid customization value types', () => {
    const groups = [
      {
        name: 'Collar',
        sortOrder: 0,
        options: [option('Spread', InputType.SINGLE_SELECT, 25, PricingType.FIXED)],
      },
    ];

    expect(() => pricingService.calculateTailoringTotal(garmentType(groups), { Collar: true }, 1)).toThrow(
      new BadRequestException('Invalid value type for customization group: Collar'),
    );
  });

  it('applies the total tailoring price for every garment quantity', () => {
    const groups = [
      {
        name: 'Collar',
        sortOrder: 0,
        options: [option('Spread', InputType.SINGLE_SELECT, 25, PricingType.FIXED)],
      },
    ];

    expect(pricingService.calculateTailoringTotal(garmentType(groups), { Collar: 'Spread' }, 3)).toBe(
      375,
    );
  });

  it('keeps zero-price options free and text options automatically free', () => {
    const groups = [
      {
        name: 'Monogram',
        sortOrder: 0,
        options: [option('Text', InputType.TEXT, 50, PricingType.FIXED)],
      },
      {
        name: 'Pocket',
        sortOrder: 1,
        options: [option('None', InputType.SINGLE_SELECT, 0, PricingType.FIXED)],
      },
    ];

    expect(
      pricingService.calculateTailoringTotal(
        garmentType(groups),
        { Monogram: 'ASH', Pocket: 'None' },
        1,
      ),
    ).toBe(100);
  });

  it('returns the selected configuration and calculated snapshot values', () => {
    const groups = [
      {
        name: 'Embroidery',
        sortOrder: 0,
        options: [option('Stitches', InputType.NUMBER, 5, PricingType.PER_UNIT)],
      },
    ];

    expect(
      pricingService.calculateTailoringPricing(garmentType(groups), { Embroidery: 3 }, 2),
    ).toEqual({
      baseTailoringPrice: 100,
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
      calculatedPerGarmentTailoringAmount: 115,
      quantity: 2,
      finalTailoringTotal: 230,
    });
  });

  it('keeps an existing pricing breakdown unchanged after catalog prices change', () => {
    const groups = [
      {
        name: 'Collar',
        sortOrder: 0,
        options: [option('Spread', InputType.SINGLE_SELECT, 25, PricingType.FIXED)],
      },
    ];
    const configuration = garmentType(groups) as { tailoringService: { basePrice: number }; customizationGroups: typeof groups };
    const snapshot = pricingService.calculateTailoringPricing(configuration, { Collar: 'Spread' }, 1);

    configuration.tailoringService.basePrice = 999;
    configuration.customizationGroups[0].options[0].price = 999;

    expect(snapshot).toMatchObject({
      baseTailoringPrice: 100,
      calculatedPerGarmentTailoringAmount: 125,
      finalTailoringTotal: 125,
    });
  });
});
