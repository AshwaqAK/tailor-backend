/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ServiceCategory } from '../enums/service-category.enum';
import { CreateServiceDto } from './create-service.dto';
import { UpdateServiceDto } from './update-service.dto';

describe('Tailoring service DTO validation', () => {
  const validService = () => ({
    name: 'Premium Stitching',
    category: ServiceCategory.STITCHING,
    price: 750.5,
  });

  it('accepts all required service fields', async () => {
    await expect(
      validate(plainToInstance(CreateServiceDto, validService())),
    ).resolves.toHaveLength(0);
  });

  it('rejects missing required fields', async () => {
    const errors = await validate(plainToInstance(CreateServiceDto, {}));

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['name', 'category', 'price']),
    );
  });

  it('rejects an invalid service category', async () => {
    const errors = await validate(
      plainToInstance(CreateServiceDto, {
        ...validService(),
        category: 'DRY_CLEANING',
      }),
    );

    expect(errors.map((error) => error.property)).toContain('category');
  });

  it('rejects a negative price', async () => {
    const errors = await validate(
      plainToInstance(CreateServiceDto, { ...validService(), price: -0.01 }),
    );

    expect(errors.map((error) => error.property)).toContain('price');
  });

  it('rejects immutable and unsupported create fields', async () => {
    const dto = plainToInstance(CreateServiceDto, {
      ...validService(),
      serviceId: 'SRV-000001',
      createdBy: 'USR-000001',
      updatedBy: 'USR-000002',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['serviceId', 'createdBy', 'updatedBy']),
    );
  });

  it('rejects immutable and unsupported update fields', async () => {
    const dto = plainToInstance(UpdateServiceDto, {
      price: 500,
      serviceId: 'SRV-999999',
      createdBy: 'USR-999999',
      updatedBy: 'USR-999998',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['serviceId', 'createdBy', 'updatedBy']),
    );
  });
});
