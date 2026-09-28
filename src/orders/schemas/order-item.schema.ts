import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { Customer } from '../../customers/schemas/customer.schema';
import { FabricType } from '../../fabrics/enums/fabric-type.enum';
import { QuantityUnit } from '../../fabrics/enums/quantity-unit.enum';
import { Fabric } from '../../fabrics/schemas/fabric.schema';
import { ClothingType } from '../../measurements/enums/clothing-type.enum';
import { FitPreference } from '../../measurements/enums/fit-preference.enum';
import { Measurement } from '../../measurements/schemas/measurement.schema';

@Schema({
  _id: false,
  versionKey: false,
})
export class MeasurementSnapshot {
  @Prop({
    type: String,
    ref: Customer.name,
    required: true,
    trim: true,
  })
  customerId!: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: Measurement.name,
    required: true,
  })
  measurementId!: Types.ObjectId;

  @Prop({
    type: Number,
    required: true,
    min: 1,
  })
  measurementVersion!: number;

  @Prop({
    type: String,
    enum: ClothingType,
    required: true,
  })
  clothingType!: ClothingType;

  @Prop({
    type: Map,
    of: Number,
    required: true,
  })
  measurements!: Map<string, number>;

  @Prop({
    type: String,
    enum: FitPreference,
  })
  fitPreference?: FitPreference;

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    type: Date,
    required: true,
  })
  measuredAt!: Date;
}

export const MeasurementSnapshotSchema = SchemaFactory.createForClass(MeasurementSnapshot);

@Schema({
  _id: false,
  versionKey: false,
})
export class FabricSnapshot {
  @Prop({
    type: String,
    ref: Fabric.name,
    required: true,
    trim: true,
    match: /^FAB-\d{6}$/,
  })
  fabricId!: string;

  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    type: String,
    enum: FabricType,
    required: true,
  })
  type!: FabricType;

  @Prop({
    required: true,
    trim: true,
  })
  color!: string;

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
    type: Number,
    required: true,
    min: Number.MIN_VALUE,
  })
  quantityUsed!: number;
}

export const FabricSnapshotSchema = SchemaFactory.createForClass(FabricSnapshot);

export type OrderItemDocument = HydratedDocument<OrderItem> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({
  timestamps: true,
  versionKey: false,
})
export class OrderItem {
  @Prop({
    type: String,
    ref: 'Order',
    required: true,
    index: true,
    trim: true,
  })
  orderId!: string;

  @Prop({
    type: String,
    enum: ClothingType,
    required: true,
  })
  clothingType!: ClothingType;

  @Prop({
    type: Number,
    required: true,
    min: 1,
  })
  quantity!: number;

  @Prop({
    type: Number,
    required: true,
    min: 0,
  })
  unitPrice!: number;

  @Prop({
    type: Number,
    min: 1,
  })
  measurementVersion?: number;

  @Prop({
    type: MeasurementSnapshotSchema,
  })
  measurementSnapshot?: MeasurementSnapshot;

  @Prop({
    type: FabricSnapshotSchema,
  })
  fabricSnapshot?: FabricSnapshot;

  @Prop({
    trim: true,
  })
  notes?: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
