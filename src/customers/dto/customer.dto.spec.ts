/// <reference types="jest" />

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCustomerDto } from './create-customer.dto';
import { UpdateCustomerDto } from './update-customer.dto';
import { Gender } from '../enums/gender.enum';

describe('Customer DTO validation', () => {
  it('accepts valid required and optional customer fields', async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      name: 'Customer One',
      phone: '+919876543210',
      email: 'customer@example.com',
      gender: Gender.FEMALE,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects missing required fields', async () => {
    const errors = await validate(plainToInstance(CreateCustomerDto, {}));

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['name', 'phone']),
    );
  });

  it('rejects invalid email and phone values', async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      name: 'Customer One',
      phone: '1234567890',
      email: 'not-an-email',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['phone', 'email']),
    );
  });

  it('rejects immutable and unsupported update fields', async () => {
    const dto = plainToInstance(UpdateCustomerDto, {
      name: 'Updated Customer',
      customerId: 'CUS-999999',
      createdBy: 'USR-000001',
      isActive: false,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['customerId', 'createdBy', 'isActive']),
    );
  });
});
