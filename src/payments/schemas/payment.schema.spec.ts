/// <reference types="jest" />

import 'reflect-metadata';
import { model } from 'mongoose';

import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { Payment, PaymentSchema } from './payment.schema';

jest.mock('@nestjs/mongoose', () => {
  const mongoose = jest.requireActual<typeof import('mongoose')>('mongoose');
  const properties = new WeakMap<object, Record<string, unknown>>();
  const schemaOptions = new WeakMap<object, Record<string, unknown>>();

  return {
    Prop:
      (options: Record<string, unknown> = {}) =>
      (target: object, propertyKey: string): void => {
        const definition = properties.get(target.constructor) ?? {};
        definition[propertyKey] = {
          type:
            options.type ?? (Reflect.getMetadata('design:type', target, propertyKey) as unknown),
          ...options,
        };
        properties.set(target.constructor, definition);
      },
    Schema:
      (options: Record<string, unknown> = {}) =>
      <T extends object>(target: T): T => {
        schemaOptions.set(target, options);
        return target;
      },
    SchemaFactory: {
      createForClass: (target: object) =>
        new mongoose.Schema(properties.get(target) ?? {}, schemaOptions.get(target) ?? {}),
    },
  };
});

describe('PaymentSchema', () => {
  const PaymentModel = model<Payment>('PaymentSchemaTest', PaymentSchema.clone());

  it('accepts a valid successful payment document', async () => {
    const payment = new PaymentModel({
      paymentId: 'PAY-000001',
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      amount: 250,
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.SUCCESS,
      paidAt: new Date('2026-10-01T00:00:00.000Z'),
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
    });

    await expect(payment.validate()).resolves.toBeUndefined();
  });

  it.each([
    [{ paymentId: 'PAY-1' }, 'paymentId'],
    [{ amount: 0 }, 'amount'],
    [{ paymentMethod: 'CHEQUE' }, 'paymentMethod'],
    [{ status: 'PAID' }, 'status'],
  ])('rejects invalid schema value %#', (override, path) => {
    const payment = new PaymentModel({
      paymentId: 'PAY-000001',
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      amount: 250,
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.SUCCESS,
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
      ...override,
    });

    const validationError = payment.validateSync();

    expect(validationError).toBeDefined();
    expect(validationError?.errors).toHaveProperty(path);
  });

  it.each(['orderId', 'customerId', 'amount', 'transactionId'])(
    'keeps finalized payment field %s immutable',
    (path) => {
      const immutable = PaymentSchema.path(path).options.immutable as (this: Payment) => boolean;

      expect(immutable.call({ status: PaymentStatus.PENDING })).toBe(false);
      expect(immutable.call({ status: PaymentStatus.SUCCESS })).toBe(true);
      expect(immutable.call({ status: PaymentStatus.REFUNDED })).toBe(true);
    },
  );

  it('defines the successful transaction-reference uniqueness index', () => {
    expect(PaymentSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { transactionId: 1 },
          expect.objectContaining({
            unique: true,
            name: 'unique_success_transaction_id',
            partialFilterExpression: {
              transactionId: { $type: 'string' },
              status: PaymentStatus.SUCCESS,
            },
          }),
        ],
      ]),
    );
  });
});
