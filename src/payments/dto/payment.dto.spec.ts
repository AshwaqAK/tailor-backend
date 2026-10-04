/// <reference types="jest" />

import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePaymentDto } from './create-payment.dto';
import { PaymentQueryDto } from './payment-query.dto';

describe('CreatePaymentDto validation', () => {
  const metadata: ArgumentMetadata = { type: 'body', metatype: CreatePaymentDto };
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const validInput = () => ({
    orderId: 'ORD-000001',
    customerId: 'CUS-000001',
    amount: 250.5,
    paymentMethod: 'UPI',
    transactionId: 'UPI-REF-001',
    notes: 'Advance payment',
  });

  it('accepts valid payment creation input and transforms the amount', async () => {
    await expect(
      validationPipe.transform({ ...validInput(), amount: '250.50' }, metadata),
    ).resolves.toEqual(expect.objectContaining({ amount: 250.5 }));
  });

  it.each(['orderId', 'customerId', 'amount', 'paymentMethod'])(
    'rejects a missing required %s field',
    async (field) => {
      const input: Record<string, unknown> = validInput();
      delete input[field];

      await expect(validationPipe.transform(input, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it.each([0, -1, 'not-a-number', 10.123])(
    'rejects an invalid payment amount of %s',
    async (amount) => {
      await expect(
        validationPipe.transform({ ...validInput(), amount }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each([
    { paymentMethod: 'CHEQUE' },
    { transactionId: '   ' },
    { transactionId: 'x'.repeat(201) },
    { orderId: 'ORD-1' },
    { customerId: 'CUS-1' },
  ])('rejects invalid enum, ID, or reference input %#', async (invalidInput) => {
    await expect(
      validationPipe.transform({ ...validInput(), ...invalidInput }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    'paymentId',
    'status',
    'paidAt',
    'createdBy',
    'updatedBy',
    'paidAmount',
    'balanceAmount',
  ])('rejects the server-controlled or unknown %s property', async (property) => {
    await expect(
      validationPipe.transform({ ...validInput(), [property]: 'client-value' }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Payment query DTO validation', () => {
  it('accepts valid filters, pagination, and a same-day date range', async () => {
    const dto = plainToInstance(PaymentQueryDto, {
      page: '2',
      limit: '25',
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      paymentMethod: 'UPI',
      status: 'SUCCESS',
      fromDate: '2026-09-30',
      toDate: '2026-09-30',
      sortBy: 'paidAt',
      sortOrder: 'asc',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, limit: 25 });
  });

  it('rejects invalid IDs, enums, pagination, and sorting', async () => {
    const dto = plainToInstance(PaymentQueryDto, {
      page: 0,
      limit: 101,
      orderId: 'order-1',
      customerId: 'customer-1',
      paymentMethod: 'CHEQUE',
      status: 'PAID',
      sortBy: 'transactionId',
      sortOrder: 'newest',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'page',
        'limit',
        'orderId',
        'customerId',
        'paymentMethod',
        'status',
        'sortBy',
        'sortOrder',
      ]),
    );
  });

  it.each([
    { fromDate: 'invalid' },
    { toDate: '2026-13-40' },
    { fromDate: '2026-10-02', toDate: '2026-10-01' },
  ])('rejects invalid payment date query %#', async (value) => {
    const errors = await validate(plainToInstance(PaymentQueryDto, value));

    expect(errors.length).toBeGreaterThan(0);
  });
});
