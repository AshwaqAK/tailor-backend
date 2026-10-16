import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { Customer } from '../../customers/schemas/customer.schema';
import { OrderItem } from '../../orders/schemas/order-item.schema';
import { Order } from '../../orders/schemas/order.schema';
import { AlterationStatus } from '../enums/alteration-status.enum';

export type AlterationDocument = HydratedDocument<Alteration> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Alteration {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    immutable: true,
    match: /^ALT-\d{6}$/,
  })
  alterationId!: string;

  @Prop({
    type: String,
    ref: Customer.name,
    required: true,
    index: true,
    trim: true,
    match: /^CUS-\d{6}$/,
    immutable: true,
  })
  customerId!: string;

  @Prop({
    type: String,
    ref: Order.name,
    required: true,
    index: true,
    trim: true,
    match: /^ORD-\d{6}$/,
    immutable: true,
  })
  originalOrderId!: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: OrderItem.name,
    required: true,
    index: true,
    immutable: true,
  })
  originalOrderItemId!: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    minlength: 1,
  })
  description!: string;

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    type: String,
    enum: AlterationStatus,
    required: true,
    default: AlterationStatus.REQUESTED,
    index: true,
  })
  status!: AlterationStatus;

  @Prop({
    type: Number,
    required: true,
    default: 0,
    min: 0,
    immutable: function (this: Alteration): boolean {
      return Boolean(this.billingOrderId);
    },
  })
  charge!: number;

  @Prop({
    type: String,
    ref: 'Order',
    trim: true,
    match: /^ORD-\d{6}$/,
    index: true,
  })
  billingOrderId?: string;

  @Prop({
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
  })
  requestDate!: Date;

  @Prop({
    type: Date,
    validate: {
      validator(this: Alteration, value?: Date): boolean {
        return value === undefined || value >= this.requestDate;
      },
      message: 'completionDate must be on or after requestDate',
    },
  })
  completionDate?: Date;

  @Prop({
    type: String,
    ref: 'User',
    required: true,
    trim: true,
    immutable: true,
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

export const AlterationSchema = SchemaFactory.createForClass(Alteration);

AlterationSchema.index({ customerId: 1, status: 1, createdAt: -1 });
AlterationSchema.index({ originalOrderId: 1, originalOrderItemId: 1 });
