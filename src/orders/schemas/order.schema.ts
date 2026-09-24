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
