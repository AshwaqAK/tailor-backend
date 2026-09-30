import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

function isFinalizedPayment(this: Payment): boolean {
  return [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED].includes(this.status);
}

export type PaymentDocument = HydratedDocument<Payment> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: (_document, result: Record<string, unknown>) => {
      delete result._id;
      return result;
    },
  },
})
export class Payment {
  @Prop({
    required: true,
    unique: true,
    index: true,
    immutable: true,
    trim: true,
    match: /^PAY-\d{6}$/,
  })
  paymentId!: string;

  @Prop({
    type: String,
    ref: 'Order',
    required: true,
    index: true,
    immutable: isFinalizedPayment,
    trim: true,
  })
  orderId!: string;

  @Prop({
    type: String,
    ref: 'Customer',
    required: true,
    index: true,
    immutable: isFinalizedPayment,
    trim: true,
  })
  customerId!: string;

  @Prop({
    type: Number,
    required: true,
    immutable: isFinalizedPayment,
    min: Number.MIN_VALUE,
  })
  amount!: number;

  @Prop({
    type: String,
    enum: PaymentMethod,
    required: true,
    index: true,
  })
  paymentMethod!: PaymentMethod;

  @Prop({
    type: String,
    enum: PaymentStatus,
    required: true,
    default: PaymentStatus.PENDING,
    index: true,
  })
  status!: PaymentStatus;

  @Prop({
    immutable: isFinalizedPayment,
    trim: true,
  })
  transactionId?: string;

  @Prop({
    type: Date,
    index: true,
  })
  paidAt?: Date;

  @Prop({
    type: Date,
  })
  refundedAt?: Date;

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    type: String,
    ref: 'User',
    required: true,
    trim: true,
  })
  createdBy!: string;

  @Prop({
    type: String,
    ref: 'User',
    required: true,
    trim: true,
  })
  updatedBy!: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ orderId: 1, status: 1 });
PaymentSchema.index({ orderId: 1, paidAt: -1 });
PaymentSchema.index({ customerId: 1, paidAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transactionId: { $type: 'string' },
      status: PaymentStatus.SUCCESS,
    },
    name: 'unique_success_transaction_id',
  },
);
