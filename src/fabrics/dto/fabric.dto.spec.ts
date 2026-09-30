/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FabricType } from '../enums/fabric-type.enum';
import { QuantityUnit } from '../enums/quantity-unit.enum';
import { CreateFabricDto } from './create-fabric.dto';
import { UpdateFabricDto } from './update-fabric.dto';

describe('Fabric DTO validation', () => {
  const validFabric = () => ({
    name: 'Premium Cotton',
    type: FabricType.COTTON,
    color: 'Navy Blue',
    quantity: 10.5,
    unit: QuantityUnit.METER,
    pricePerUnit: 250,
  });

  it('accepts all required fabric fields', async () => {
    await expect(
      validate(plainToInstance(CreateFabricDto, validFabric())),
    ).resolves.toHaveLength(0);
  });

  it('rejects missing required fields', async () => {
    const errors = await validate(plainToInstance(CreateFabricDto, {}));

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'name',
        'type',
        'color',
        'quantity',
        'unit',
        'pricePerUnit',
      ]),
    );
  });

  it('rejects invalid fabric type and quantity unit', async () => {
    const errors = await validate(
      plainToInstance(CreateFabricDto, {
        ...validFabric(),
        type: 'LEATHER',
        unit: 'YARD',
      }),
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['type', 'unit']),
    );
  });

  it('rejects negative quantity and price', async () => {
    const errors = await validate(
      plainToInstance(CreateFabricDto, {
        ...validFabric(),
        quantity: -1,
        pricePerUnit: -0.01,
      }),
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['quantity', 'pricePerUnit']),
    );
  });

  it('rejects immutable and unsupported create fields', async () => {
    const dto = plainToInstance(CreateFabricDto, {
      ...validFabric(),
      fabricId: 'FAB-000001',
      createdBy: 'USR-000001',
      updatedBy: 'USR-000002',
      stockDeductedOrderIds: ['ORD-000001'],
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'fabricId',
        'createdBy',
        'updatedBy',
        'stockDeductedOrderIds',
      ]),
    );
  });

  it('rejects immutable and unsupported update fields', async () => {
    const dto = plainToInstance(UpdateFabricDto, {
      name: 'Updated Cotton',
      fabricId: 'FAB-999999',
      createdBy: 'USR-999999',
      updatedBy: 'USR-999998',
      stockDeductedOrderIds: ['ORD-999999'],
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'fabricId',
        'createdBy',
        'updatedBy',
        'stockDeductedOrderIds',
      ]),
    );
  });
});
