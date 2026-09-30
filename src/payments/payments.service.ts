import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';

import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Counter, CounterDocument } from '../users/schemas/counter.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { parsePaymentQueryDate, PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentStatus } from './enums/payment-status.enum';
import { Payment, PaymentDocument } from './schemas/payment.schema';

export interface PaginatedPayments {
  data: PaymentDocument[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class PaymentsService {
  private readonly payableOrderStatuses = new Set<OrderStatus>([
    OrderStatus.CONFIRMED,
    OrderStatus.IN_PROGRESS,
    OrderStatus.READY,
    OrderStatus.DELIVERED,
  ]);

  constructor(
    @InjectConnection()
    private readonly connection: Connection,

    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,

    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async create(
    createPaymentDto: CreatePaymentDto,
    userId: string,
  ): Promise<PaymentDocument> {
    let session: ClientSession | undefined;

    try {
      session = await this.connection.startSession();
      session.startTransaction();

      this.validatePaymentAmount(createPaymentDto.amount);

      const order = await this.orderModel
        .findOne({ orderId: createPaymentDto.orderId })
        .session(session)
        .exec();

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (!this.payableOrderStatuses.has(order.status)) {
        throw new BadRequestException(
          `Payment is not allowed for an order with status ${order.status}`,
        );
      }

      const customerExists = await this.customerModel
        .exists({ customerId: createPaymentDto.customerId })
        .session(session)
        .exec();

      if (!customerExists) {
        throw new NotFoundException('Customer not found');
      }

      if (order.customerId !== createPaymentDto.customerId) {
        throw new BadRequestException('Customer does not belong to the requested order');
      }

      this.validateOrderAccounting(order);

      if (createPaymentDto.amount > order.balanceAmount) {
        throw new BadRequestException('Payment amount exceeds the outstanding balance');
      }

      if (createPaymentDto.transactionId) {
        const duplicateTransaction = await this.paymentModel
          .findOne({
            transactionId: createPaymentDto.transactionId,
            status: { $in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
          })
          .session(session)
          .exec();

        if (duplicateTransaction) {
          throw new ConflictException('Payment transaction ID already exists');
        }
      }

      const paymentId = await this.generatePaymentId(session);
      const paidAt = new Date();
      const payment = new this.paymentModel({
        paymentId,
        orderId: order.orderId,
        customerId: order.customerId,
        amount: createPaymentDto.amount,
        paymentMethod: createPaymentDto.paymentMethod,
        status: PaymentStatus.SUCCESS,
        transactionId: createPaymentDto.transactionId,
        paidAt,
        notes: createPaymentDto.notes,
        createdBy: userId,
        updatedBy: userId,
      });

      await payment.save({ session });

      const newPaidAmount = this.roundCurrency(order.paidAmount + createPaymentDto.amount);
      const newBalanceAmount = this.roundCurrency(order.totalAmount - newPaidAmount);

      if (newPaidAmount > order.totalAmount || newBalanceAmount < 0) {
        throw new BadRequestException('Payment amount exceeds the outstanding balance');
      }

      const updatedOrder = await this.orderModel
        .findOneAndUpdate(
          {
            orderId: order.orderId,
            paidAmount: order.paidAmount,
            balanceAmount: order.balanceAmount,
            status: { $in: [...this.payableOrderStatuses] },
          },
          {
            $set: {
              paidAmount: newPaidAmount,
              balanceAmount: newBalanceAmount,
              updatedBy: userId,
            },
          },
          { new: true, session },
        )
        .exec();

      if (!updatedOrder) {
        throw new ConflictException('Order payment balance changed; retry payment');
      }

      await session.commitTransaction();

      return payment;
    } catch (error) {
      if (session?.inTransaction()) {
        await session.abortTransaction();
      }

      return this.rethrowServiceError(error);
    } finally {
      await session?.endSession();
    }
  }

  async findAll(query: PaymentQueryDto): Promise<PaginatedPayments> {
    const {
      page = 1,
      limit = 20,
      orderId,
      customerId,
      paymentMethod,
      status,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const filter: Record<string, unknown> = {};

    if (orderId) {
      filter.orderId = orderId;
    }

    if (customerId) {
      filter.customerId = customerId;
    }

    if (paymentMethod) {
      filter.paymentMethod = paymentMethod;
    }

    if (status) {
      filter.status = status;
    }

    if (fromDate || toDate) {
      const paidAtRange: { $gte?: Date; $lt?: Date } = {};

      if (fromDate) {
        paidAtRange.$gte = parsePaymentQueryDate(fromDate);
      }

      if (toDate) {
        const exclusiveUpperBoundary = parsePaymentQueryDate(toDate);

        if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
          exclusiveUpperBoundary.setUTCDate(exclusiveUpperBoundary.getUTCDate() + 1);
        } else {
          exclusiveUpperBoundary.setTime(exclusiveUpperBoundary.getTime() + 1);
        }

        paidAtRange.$lt = exclusiveUpperBoundary;
      }

      filter.paidAt = paidAtRange;
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    try {
      const [payments, total] = await Promise.all([
        this.paymentModel
          .find(filter)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.paymentModel.countDocuments(filter).exec(),
      ]);

      return {
        data: payments,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.rethrowReadError(error, 'list');
    }
  }

  async refund(paymentId: string, userId: string): Promise<PaymentDocument> {
    let session: ClientSession | undefined;

    try {
      session = await this.connection.startSession();
      session.startTransaction();

      const payment = await this.paymentModel.findOne({ paymentId }).session(session).exec();

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (payment.status === PaymentStatus.REFUNDED) {
        throw new ConflictException('Payment has already been refunded');
      }

      if (payment.status !== PaymentStatus.SUCCESS) {
        throw new BadRequestException(
          `Payment with status ${payment.status} cannot be refunded`,
        );
      }

      this.validatePaymentAmount(payment.amount);

      const order = await this.orderModel
        .findOne({ orderId: payment.orderId })
        .session(session)
        .exec();

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.customerId !== payment.customerId) {
        throw new ConflictException('Payment customer does not match the order customer');
      }

      this.validateOrderAccounting(order);

      const newPaidAmount = this.roundCurrency(order.paidAmount - payment.amount);

      if (newPaidAmount < 0) {
        throw new ConflictException('Refund would make the order paid amount negative');
      }

      const newBalanceAmount = this.roundCurrency(order.totalAmount - newPaidAmount);
      const refundedAt = new Date();
      const refundedPayment = await this.paymentModel
        .findOneAndUpdate(
          {
            paymentId: payment.paymentId,
            status: PaymentStatus.SUCCESS,
          },
          {
            $set: {
              status: PaymentStatus.REFUNDED,
              refundedAt,
              updatedBy: userId,
            },
          },
          { new: true, session },
        )
        .exec();

      if (!refundedPayment) {
        throw new ConflictException('Payment refund state changed; retry refund');
      }

      const updatedOrder = await this.orderModel
        .findOneAndUpdate(
          {
            orderId: order.orderId,
            customerId: payment.customerId,
            paidAmount: order.paidAmount,
            balanceAmount: order.balanceAmount,
          },
          {
            $set: {
              paidAmount: newPaidAmount,
              balanceAmount: newBalanceAmount,
              updatedBy: userId,
            },
          },
          { new: true, session },
        )
        .exec();

      if (!updatedOrder) {
        throw new ConflictException('Order payment balance changed; retry refund');
      }

      await session.commitTransaction();

      return refundedPayment;
    } catch (error) {
      if (session?.inTransaction()) {
        await session.abortTransaction();
      }

      return this.rethrowRefundError(error);
    } finally {
      await session?.endSession();
    }
  }

  async findOne(paymentId: string): Promise<PaymentDocument> {
    try {
      const payment = await this.paymentModel.findOne({ paymentId }).exec();

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      return payment;
    } catch (error) {
      this.rethrowReadError(error, 'retrieve');
    }
  }

  async findByOrder(
    orderId: string,
    query: PaymentQueryDto,
  ): Promise<PaginatedPayments> {
    try {
      const orderExists = await this.orderModel.exists({ orderId }).exec();

      if (!orderExists) {
        throw new NotFoundException('Order not found');
      }
    } catch (error) {
      this.rethrowReadError(error, 'retrieve order payments');
    }

    return this.findAll(Object.assign(new PaymentQueryDto(), query, { orderId }));
  }

  private validatePaymentAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
  }

  private validateOrderAccounting(order: OrderDocument): void {
    const amounts = [order.totalAmount, order.paidAmount, order.balanceAmount];
    const expectedBalance = this.roundCurrency(order.totalAmount - order.paidAmount);

    if (
      amounts.some((amount) => !Number.isFinite(amount) || amount < 0) ||
      order.paidAmount > order.totalAmount ||
      order.balanceAmount !== expectedBalance
    ) {
      throw new ConflictException('Order payment accounting is inconsistent');
    }
  }

  private roundCurrency(value: number): number {
    return Number(value.toFixed(2));
  }

  private async generatePaymentId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'payment' },
        { $inc: { sequence: 1 } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          session,
        },
      )
      .exec();

    if (!counter) {
      throw new InternalServerErrorException('Failed to generate payment ID');
    }

    return `PAY-${String(counter.sequence).padStart(6, '0')}`;
  }

  private rethrowServiceError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isTransactionConflict(error)) {
      throw new ConflictException('Payment processing conflicted; retry payment');
    }

    if (this.isDuplicateTransactionIdError(error)) {
      throw new ConflictException('Payment transaction ID already exists');
    }

    if (this.isDuplicateKeyError(error)) {
      throw new ConflictException('Payment ID already exists');
    }

    throw new InternalServerErrorException('Unable to create payment');
  }

  private rethrowReadError(error: unknown, action: string): never {
    if (error instanceof HttpException) {
      throw error;
    }

    throw new InternalServerErrorException(`Unable to ${action} payments`);
  }

  private rethrowRefundError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isTransactionConflict(error)) {
      throw new ConflictException('Payment refund conflicted; retry refund');
    }

    throw new InternalServerErrorException('Unable to refund payment');
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }

  private isDuplicateTransactionIdError(error: unknown): boolean {
    if (!this.isDuplicateKeyError(error)) {
      return false;
    }

    const duplicateError = error as {
      keyPattern?: Record<string, unknown>;
      keyValue?: Record<string, unknown>;
    };

    return (
      duplicateError.keyPattern?.transactionId !== undefined ||
      duplicateError.keyValue?.transactionId !== undefined
    );
  }

  private isTransactionConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('hasErrorLabel' in error)) {
      return false;
    }

    const transactionError = error as {
      hasErrorLabel?: (label: string) => boolean;
    };

    return transactionError.hasErrorLabel?.('TransientTransactionError') === true;
  }
}
