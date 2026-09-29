import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { FabricType } from '../enums/fabric-type.enum';
import { QuantityUnit } from '../enums/quantity-unit.enum';

export type FabricDocument = HydratedDocument<Fabric> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true, versionKey: false })
export class Fabric {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    match: /^FAB-\d{6}$/,
  })
  fabricId!: string;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  name!: string;

  @Prop({
    type: String,
    enum: FabricType,
    required: true,
    index: true,
  })
  type!: FabricType;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  color!: string;

  @Prop({
    type: Number,
    required: true,
    min: 0,
  })
  quantity!: number;

  @Prop({
    type: String,
    enum: QuantityUnit,
    required: true,
  })
  unit!: QuantityUnit;

  @Prop({
    type: Number,
    required: true,
    min: 0,
  })
  pricePerUnit!: number;

  @Prop({
    trim: true,
  })
  supplier?: string;

  @Prop({
    trim: true,
  })
  description?: string;

  @Prop({
    required: true,
    default: true,
  })
  isActive!: boolean;

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

  @Prop({
    type: [String],
    default: [],
    select: false,
  })
  stockDeductedOrderIds!: string[];
}

export const FabricSchema = SchemaFactory.createForClass(Fabric);

FabricSchema.index({ createdAt: 1, isActive: 1 });
FabricSchema.index({ isActive: 1, quantity: 1 });
