/// <reference types="jest" />

import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Connection, Model } from 'mongoose';

import type { CustomerDocument } from '../customers/schemas/customer.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import type { OrderDocument } from '../orders/schemas/order.schema';
import type { CounterDocument } from '../users/schemas/counter.schema';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentsService } from './payments.service';
import type { PaymentDocument } from './schemas/payment.schema';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('PaymentsService', () => {
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let paymentModel: jest.Mock & {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    countDocuments: jest.Mock;
  };
  let orderModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock; exists: jest.Mock };
  let customerModel: { exists: jest.Mock };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let connection: { startSession: jest.Mock };
  let service: PaymentsService;

  const validDto = () => ({
    orderId: 'ORD-000001',
    customerId: 'CUS-000001',
    amount: 250,
    paymentMethod: PaymentMethod.UPI,
    transactionId: 'UPI-REF-001',
    paidAt: new Date('2020-01-01T00:00:00.000Z'),
    notes: 'Advance payment',
  });

  const createOrder = (overrides: Partial<OrderDocument> = {}) =>
    ({
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      status: OrderStatus.CONFIRMED,
      totalAmount: 1000,
      paidAmount: 200,
      balanceAmount: 800,
      ...overrides,
    }) as OrderDocument;

  const createPaymentDocument = (overrides: Partial<PaymentDocument> = {}) => {
    const save = jest.fn();
    const payment = {
      paymentId: 'PAY-000007',
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      amount: 250,
      paymentMethod: PaymentMethod.UPI,
      status: PaymentStatus.SUCCESS,
      transactionId: 'UPI-REF-001',
      createdBy: 'USR-000009',
      updatedBy: 'USR-000009',
      save,
      ...overrides,
    } as unknown as PaymentDocument;
    save.mockResolvedValue(payment);
    return { payment, save };
  };

  const sessionQuery = (result: unknown) => {
    const query = {
      session: jest.fn(),
      exec: jest.fn().mockResolvedValue(result),
    };
    query.session.mockReturnValue(query);
    return query;
  };

  const mockSuccessfulDependencies = (
    order: OrderDocument = createOrder(),
    updatedOrder: OrderDocument = order,
  ) => {
    const orderQuery = sessionQuery(order);
    orderModel.findOne.mockReturnValue(orderQuery);
    customerModel.exists.mockReturnValue(sessionQuery({ _id: 'customer-id' }));
    paymentModel.findOne.mockReturnValue(sessionQuery(null));
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    orderModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(updatedOrder),
    });
    const document = createPaymentDocument();
    paymentModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(document.payment, data),
    );
    return { ...document, orderQuery };
  };

  const mockRefundDependencies = (
    payment: PaymentDocument = createPaymentDocument().payment,
    order: OrderDocument = createOrder({ paidAmount: 450, balanceAmount: 550 }),
    refundedPayment: PaymentDocument | null = payment,
    updatedOrder: OrderDocument | null = order,
  ) => {
    paymentModel.findOne.mockReturnValue(sessionQuery(payment));
    orderModel.findOne.mockReturnValue(sessionQuery(order));
    paymentModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(refundedPayment),
    });
    orderModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(updatedOrder),
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-01T10:30:00.000Z'));
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(true),
      endSession: jest.fn(),
    };
    paymentModel = Object.assign(jest.fn(), {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
    });
    orderModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), exists: jest.fn() };
    customerModel = { exists: jest.fn() };
    counterModel = { findOneAndUpdate: jest.fn() };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    service = new PaymentsService(
      connection as unknown as Connection,
      paymentModel as unknown as Model<PaymentDocument>,
      orderModel as unknown as Model<OrderDocument>,
      customerModel as unknown as Model<CustomerDocument>,
      counterModel as unknown as Model<CounterDocument>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('records a successful partial payment and atomically updates the order balance', async () => {
    const { payment, save } = mockSuccessfulDependencies();

    const result = await service.create(validDto(), 'USR-000009');

    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'payment' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({ session }),
    );
    expect(paymentModel).toHaveBeenCalledWith({
      paymentId: 'PAY-000007',
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      amount: 250,
      paymentMethod: PaymentMethod.UPI,
      status: PaymentStatus.SUCCESS,
      transactionId: 'UPI-REF-001',
      paidAt: new Date('2026-10-01T10:30:00.000Z'),
      notes: 'Advance payment',
      createdBy: 'USR-000009',
      updatedBy: 'USR-000009',
    });
    expect(save).toHaveBeenCalledWith({ session });
    expect(orderModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        orderId: 'ORD-000001',
        paidAmount: 200,
        balanceAmount: 800,
        status: {
          $in: [
            OrderStatus.CONFIRMED,
            OrderStatus.IN_PROGRESS,
            OrderStatus.READY,
            OrderStatus.DELIVERED,
          ],
        },
      },
      {
        $set: {
          paidAmount: 450,
          balanceAmount: 550,
          updatedBy: 'USR-000009',
        },
      },
      { new: true, session },
    );
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(result).toBe(payment);
  });

  it('records a full payment with a zero remaining balance', async () => {
    mockSuccessfulDependencies();
    const dto = { ...validDto(), amount: 800 };

    await service.create(dto, 'USR-000001');

    expect(orderModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      { $set: { paidAmount: 1000, balanceAmount: 0, updatedBy: 'USR-000001' } },
      { new: true, session },
    );
  });

  it.each([
    OrderStatus.CONFIRMED,
    OrderStatus.IN_PROGRESS,
    OrderStatus.READY,
    OrderStatus.DELIVERED,
  ])('records payment for an eligible %s order', async (status) => {
    mockSuccessfulDependencies(createOrder({ status }));

    await expect(service.create(validDto(), 'USR-000001')).resolves.toEqual(
      expect.objectContaining({ status: PaymentStatus.SUCCESS }),
    );
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects another payment when the order is already fully paid', async () => {
    orderModel.findOne.mockReturnValue(
      sessionQuery(createOrder({ paidAmount: 1000, balanceAmount: 0 })),
    );
    customerModel.exists.mockReturnValue(sessionQuery({ _id: 'customer-id' }));

    await expect(service.create({ ...validDto(), amount: 1 }, 'USR-000001')).rejects.toThrow(
      new BadRequestException('Payment amount exceeds the outstanding balance'),
    );
    expect(paymentModel).not.toHaveBeenCalled();
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a payment greater than the outstanding balance', async () => {
    orderModel.findOne.mockReturnValue(sessionQuery(createOrder()));
    customerModel.exists.mockReturnValue(sessionQuery({ _id: 'customer-id' }));

    await expect(service.create({ ...validDto(), amount: 800.01 }, 'USR-000001')).rejects.toThrow(
      new BadRequestException('Payment amount exceeds the outstanding balance'),
    );
    expect(paymentModel).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it.each([0, -1])('rejects a non-positive payment amount of %s', async (amount) => {
    await expect(service.create({ ...validDto(), amount }, 'USR-000001')).rejects.toThrow(
      new BadRequestException('Payment amount must be greater than zero'),
    );
    expect(orderModel.findOne).not.toHaveBeenCalled();
  });

  it.each([OrderStatus.DRAFT, OrderStatus.CANCELLED])(
    'rejects payment for an order with status %s',
    async (status) => {
      orderModel.findOne.mockReturnValue(sessionQuery(createOrder({ status })));

      await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
        new BadRequestException(`Payment is not allowed for an order with status ${status}`),
      );
      expect(customerModel.exists).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing order', async () => {
    orderModel.findOne.mockReturnValue(sessionQuery(null));

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new NotFoundException('Order not found'),
    );
  });

  it('rejects a missing customer', async () => {
    orderModel.findOne.mockReturnValue(sessionQuery(createOrder()));
    customerModel.exists.mockReturnValue(sessionQuery(null));

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new NotFoundException('Customer not found'),
    );
  });

  it('rejects a customer that does not belong to the order', async () => {
    orderModel.findOne.mockReturnValue(sessionQuery(createOrder()));
    customerModel.exists.mockReturnValue(sessionQuery({ _id: 'customer-id' }));

    await expect(
      service.create({ ...validDto(), customerId: 'CUS-000002' }, 'USR-000001'),
    ).rejects.toThrow(new BadRequestException('Customer does not belong to the requested order'));
  });

  it('rejects a duplicate successful transaction reference', async () => {
    mockSuccessfulDependencies();
    paymentModel.findOne.mockReturnValue(sessionQuery({ paymentId: 'PAY-000006' }));

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new ConflictException('Payment transaction ID already exists'),
    );
    expect(counterModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('also rejects reuse of a refunded transaction reference', async () => {
    mockSuccessfulDependencies();
    paymentModel.findOne.mockReturnValue(
      sessionQuery({ paymentId: 'PAY-000006', status: PaymentStatus.REFUNDED }),
    );

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new ConflictException('Payment transaction ID already exists'),
    );
    expect(paymentModel.findOne).toHaveBeenCalledWith({
      transactionId: 'UPI-REF-001',
      status: { $in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
    });
  });

  it('rolls back when payment persistence fails', async () => {
    const { save } = mockSuccessfulDependencies();
    save.mockRejectedValue(new Error('payment write failed'));

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new InternalServerErrorException('Unable to create payment'),
    );
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('rolls back payment creation when the guarded order update fails', async () => {
    mockSuccessfulDependencies(createOrder(), null as unknown as OrderDocument);

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new ConflictException('Order payment balance changed; retry payment'),
    );
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('translates a concurrent payment transaction conflict and rolls back', async () => {
    const { save } = mockSuccessfulDependencies();
    save.mockRejectedValue({
      hasErrorLabel: (label: string) => label === 'TransientTransactionError',
    });

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new ConflictException('Payment processing conflicted; retry payment'),
    );
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });

  it('translates a session startup failure without attempting session cleanup', async () => {
    connection.startSession.mockRejectedValue(new Error('session unavailable'));

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new InternalServerErrorException('Unable to create payment'),
    );
    expect(session.startTransaction).not.toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).not.toHaveBeenCalled();
  });

  it('returns filtered payments with date boundaries and pagination', async () => {
    const { payment } = createPaymentDocument();
    const exec = jest.fn().mockResolvedValue([payment]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    paymentModel.find.mockReturnValue({ sort });
    paymentModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(21),
    });

    const result = await service.findAll({
      page: 3,
      limit: 10,
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      paymentMethod: PaymentMethod.UPI,
      status: PaymentStatus.SUCCESS,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      sortBy: 'paidAt',
      sortOrder: 'asc',
    });

    const expectedFilter = {
      orderId: 'ORD-000001',
      customerId: 'CUS-000001',
      paymentMethod: PaymentMethod.UPI,
      status: PaymentStatus.SUCCESS,
      paidAt: {
        $gte: new Date('2026-09-01T00:00:00.000Z'),
        $lt: new Date('2026-10-01T00:00:00.000Z'),
      },
    };
    expect(paymentModel.find).toHaveBeenCalledWith(expectedFilter);
    expect(paymentModel.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(sort).toHaveBeenCalledWith({ paidAt: 1 });
    expect(skip).toHaveBeenCalledWith(20);
    expect(limit).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      data: [payment],
      meta: { page: 3, limit: 10, total: 21, totalPages: 3 },
    });
  });

  it('returns an empty default paginated payment result', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    paymentModel.find.mockReturnValue({ sort });
    paymentModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

    const result = await service.findAll({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(paymentModel.find).toHaveBeenCalledWith({});
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it('finds a payment by business ID', async () => {
    const { payment } = createPaymentDocument();
    paymentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(payment) });

    await expect(service.findOne('PAY-000007')).resolves.toBe(payment);
    expect(paymentModel.findOne).toHaveBeenCalledWith({ paymentId: 'PAY-000007' });
  });

  it('throws when a payment is missing', async () => {
    paymentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.findOne('PAY-999999')).rejects.toThrow(
      new NotFoundException('Payment not found'),
    );
  });

  it('validates an order and returns only that order payment history', async () => {
    orderModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'order-id' }),
    });
    const exec = jest.fn().mockResolvedValue([]);
    paymentModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec }),
        }),
      }),
    });
    paymentModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

    const result = await service.findByOrder('ORD-000002', {
      page: 1,
      limit: 10,
      customerId: 'CUS-000001',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(orderModel.exists).toHaveBeenCalledWith({ orderId: 'ORD-000002' });
    expect(paymentModel.find).toHaveBeenCalledWith({
      orderId: 'ORD-000002',
      customerId: 'CUS-000001',
    });
    expect(result.meta).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });

  it('throws when requesting payment history for a missing order', async () => {
    orderModel.exists.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(
      service.findByOrder('ORD-999999', {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    ).rejects.toThrow(new NotFoundException('Order not found'));
    expect(paymentModel.find).not.toHaveBeenCalled();
  });

  it('fully refunds a successful payment and restores the order balance', async () => {
    const { payment } = createPaymentDocument({ amount: 250 });
    const refundedPayment = createPaymentDocument({
      amount: 250,
      status: PaymentStatus.REFUNDED,
      refundedAt: new Date('2026-10-01T10:30:00.000Z'),
      updatedBy: 'USR-000010',
    }).payment;
    mockRefundDependencies(
      payment,
      createOrder({ paidAmount: 450, balanceAmount: 550 }),
      refundedPayment,
    );

    await expect(service.refund('PAY-000007', 'USR-000010')).resolves.toBe(refundedPayment);
    expect(paymentModel.findOneAndUpdate).toHaveBeenCalledWith(
      { paymentId: 'PAY-000007', status: PaymentStatus.SUCCESS },
      {
        $set: {
          status: PaymentStatus.REFUNDED,
          refundedAt: new Date('2026-10-01T10:30:00.000Z'),
          updatedBy: 'USR-000010',
        },
      },
      { new: true, session },
    );
    expect(orderModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        orderId: 'ORD-000001',
        customerId: 'CUS-000001',
        paidAmount: 450,
        balanceAmount: 550,
      },
      { $set: { paidAmount: 200, balanceAmount: 800, updatedBy: 'USR-000010' } },
      { new: true, session },
    );
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a refund when the payment does not exist', async () => {
    paymentModel.findOne.mockReturnValue(sessionQuery(null));

    await expect(service.refund('PAY-999999', 'USR-000010')).rejects.toThrow(
      new NotFoundException('Payment not found'),
    );
    expect(orderModel.findOne).not.toHaveBeenCalled();
    expect(paymentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([PaymentStatus.PENDING, PaymentStatus.FAILED])(
    'rejects refund of a %s payment without changing order accounting',
    async (status) => {
      const { payment } = createPaymentDocument({ status });
      paymentModel.findOne.mockReturnValue(sessionQuery(payment));

      await expect(service.refund('PAY-000007', 'USR-000010')).rejects.toThrow(
        new BadRequestException(`Payment with status ${status} cannot be refunded`),
      );
      expect(orderModel.findOne).not.toHaveBeenCalled();
      expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    },
  );

  it('rejects an already refunded payment without double-counting the refund', async () => {
    const { payment } = createPaymentDocument({ status: PaymentStatus.REFUNDED });
    paymentModel.findOne.mockReturnValue(sessionQuery(payment));

    await expect(service.refund('PAY-000007', 'USR-000010')).rejects.toThrow(
      new ConflictException('Payment has already been refunded'),
    );
    expect(paymentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([0, -25, Number.NaN])(
    'rejects a refund with an invalid stored payment amount of %s',
    async (amount) => {
      const { payment } = createPaymentDocument({ amount });
      paymentModel.findOne.mockReturnValue(sessionQuery(payment));

      await expect(service.refund('PAY-000007', 'USR-000010')).rejects.toThrow(
        new BadRequestException('Payment amount must be greater than zero'),
      );
      expect(orderModel.findOne).not.toHaveBeenCalled();
    },
  );

  it('rejects a refund that would make the order paid amount negative', async () => {
    const { payment } = createPaymentDocument({ amount: 250 });
    paymentModel.findOne.mockReturnValue(sessionQuery(payment));
    orderModel.findOne.mockReturnValue(
      sessionQuery(createOrder({ paidAmount: 200, balanceAmount: 800 })),
    );

    await expect(service.refund('PAY-000007', 'USR-000010')).rejects.toThrow(
      new ConflictException('Refund would make the order paid amount negative'),
    );
    expect(paymentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects refund when its order is missing or no longer matches the customer', async () => {
    const { payment } = createPaymentDocument();
    paymentModel.findOne.mockReturnValue(sessionQuery(payment));
    orderModel.findOne.mockReturnValueOnce(sessionQuery(null));

    await expect(service.refund('PAY-000007', 'USR-000010')).rejects.toThrow(
      new NotFoundException('Order not found'),
    );

    jest.clearAllMocks();
    paymentModel.findOne.mockReturnValue(sessionQuery(payment));
    orderModel.findOne.mockReturnValue(sessionQuery(createOrder({ customerId: 'CUS-000002' })));

    await expect(service.refund('PAY-000007', 'USR-000010')).rejects.toThrow(
      new ConflictException('Payment customer does not match the order customer'),
    );
  });

  it('rejects a concurrent duplicate refund before changing order accounting', async () => {
    mockRefundDependencies(
      createPaymentDocument().payment,
      createOrder({ paidAmount: 450, balanceAmount: 550 }),
      null,
    );

    await expect(service.refund('PAY-000007', 'USR-000010')).rejects.toThrow(
      new ConflictException('Payment refund state changed; retry refund'),
    );
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back the payment status when the refund order update fails', async () => {
    mockRefundDependencies(
      createPaymentDocument().payment,
      createOrder({ paidAmount: 450, balanceAmount: 550 }),
      createPaymentDocument({ status: PaymentStatus.REFUNDED }).payment,
      null,
    );

    await expect(service.refund('PAY-000007', 'USR-000010')).rejects.toThrow(
      new ConflictException('Order payment balance changed; retry refund'),
    );
    expect(paymentModel.findOneAndUpdate).toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
