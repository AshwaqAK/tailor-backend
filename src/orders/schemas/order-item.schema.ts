import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { Customer } from '../../customers/schemas/customer.schema';
import { FabricType } from '../../fabrics/enums/fabric-type.enum';
import { QuantityUnit } from '../../fabrics/enums/quantity-unit.enum';
import { Fabric } from '../../fabrics/schemas/fabric.schema';
import { ClothingType } from '../../measurements/enums/clothing-type.enum';
import { FitPreference } from '../../measurements/enums/fit-preference.enum';
import { Measurement } from '../../measurements/schemas/measurement.schema';
import { TailoringService } from '../../services/schemas/tailoring-service.schema';
import { GarmentType } from '../../garment-types/schemas/garment-type.schema';
import { PricingType } from '../../garment-types/enums/pricing-type.enum';

@Schema({
  _id: false,
  versionKey: false,
})
export class TailoringCustomizationOptionSnapshot {
  @Prop({ required: true, trim: true })
  optionName!: string;

  @Prop({ type: String, enum: PricingType, required: true })
  pricingType!: PricingType;

  @Prop({ type: Number, required: true, min: 0 })
  configuredPrice!: number;

  @Prop({ type: Number, min: 0 })
  submittedValue?: number;

  @Prop({ type: Number, required: true, min: 0 })
  calculatedCharge!: number;
}

export const TailoringCustomizationOptionSnapshotSchema = SchemaFactory.createForClass(
  TailoringCustomizationOptionSnapshot,
);

@Schema({
  _id: false,
  versionKey: false,
})
export class TailoringCustomizationGroupSnapshot {
  @Prop({ required: true, trim: true })
  groupName!: string;

  @Prop({ type: [TailoringCustomizationOptionSnapshot], required: true })
  options!: TailoringCustomizationOptionSnapshot[];

  @Prop({ type: Number, required: true, min: 0 })
  calculatedCharge!: number;
}

export const TailoringCustomizationGroupSnapshotSchema = SchemaFactory.createForClass(
  TailoringCustomizationGroupSnapshot,
);

@Schema({
  _id: false,
  versionKey: false,
})
export class TailoringPricingSnapshot {
  @Prop({ required: true, trim: true })
  garmentTypeName!: string;

  @Prop({ required: true, trim: true, uppercase: true })
  garmentTypeCode!: string;

  @Prop({ type: Number, required: true, min: 0 })
  baseTailoringPrice!: number;

  @Prop({ type: [TailoringCustomizationGroupSnapshot], required: true })
  customizationGroups!: TailoringCustomizationGroupSnapshot[];

  @Prop({ type: Number, required: true, min: 0 })
  calculatedCustomizationCharge!: number;

  @Prop({ type: Number, required: true, min: 0 })
  calculatedPerGarmentTailoringAmount!: number;

  @Prop({ type: Number, required: true, min: 1 })
  quantity!: number;

  @Prop({ type: Number, required: true, min: 0 })
  finalTailoringTotal!: number;
}

export const TailoringPricingSnapshotSchema = SchemaFactory.createForClass(TailoringPricingSnapshot);

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
  })
  clothingType?: ClothingType;

  @Prop({
    type: String,
    ref: GarmentType.name,
    required: true,
    trim: true,
    match: /^GRT-\d{6}$/,
  })
  garmentTypeId!: string;

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

@Schema({
  _id: false,
  versionKey: false,
})
export class ServiceSnapshot {
  @Prop({
    type: String,
    ref: TailoringService.name,
    required: true,
    trim: true,
    match: /^SRV-\d{6}$/,
  })
  serviceId!: string;

  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    type: Number,
    required: true,
    min: 0,
  })
  price!: number;

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
  lineAmount!: number;
}

export const ServiceSnapshotSchema = SchemaFactory.createForClass(ServiceSnapshot);

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
  })
  clothingType?: ClothingType;

  @Prop({
    type: String,
    ref: GarmentType.name,
    required: true,
    trim: true,
    match: /^GRT-\d{6}$/,
  })
  garmentTypeId!: string;

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

  @Prop({ type: SchemaTypes.Mixed })
  customizations?: Record<string, unknown>;

  @Prop({
    type: TailoringPricingSnapshotSchema,
    required: true,
  })
  tailoringPricingSnapshot!: TailoringPricingSnapshot;

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
    type: ServiceSnapshotSchema,
  })
  serviceSnapshot?: ServiceSnapshot;

  @Prop({
    trim: true,
  })
  notes?: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
