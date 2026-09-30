import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { OrderStatus } from '../enums/order-status.enum';

export type OrderDocument = HydratedDocument<Order> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Order {
  @Prop({
    required: true,
    unique: true,
    trim: true,
  })
  orderId!: string;

  @Prop({
    type: String,
    ref: 'Customer',
    required: true,
    index: true,
    trim: true,
  })
  customerId!: string;

  @Prop({
    type: Date,
    required: true,
  })
  orderDate!: Date;

  @Prop({
    type: Date,
    index: true,
  })
  expectedDeliveryDate?: Date;

  @Prop({
    type: String,
    enum: OrderStatus,
    required: true,
    default: OrderStatus.DRAFT,
    index: true,
  })
  status!: OrderStatus;

  @Prop({
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator(this: Order, value: number): boolean {
        return Number.isFinite(value) && value >= this.paidAmount;
      },
      message: 'Order total amount must be greater than or equal to paid amount',
    },
  })
  totalAmount!: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator(this: Order, value: number): boolean {
        return Number.isFinite(value) && value <= this.totalAmount;
      },
      message: 'Order paid amount cannot exceed total amount',
    },
  })
  paidAmount!: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator(this: Order, value: number): boolean {
        const expectedBalance = Number((this.totalAmount - this.paidAmount).toFixed(2));

        return Number.isFinite(value) && value === expectedBalance;
      },
      message: 'Order balance amount must equal total amount minus paid amount',
    },
  })
  balanceAmount!: number;

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

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ createdAt: 1, status: 1 });
