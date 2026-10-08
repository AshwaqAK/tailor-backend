import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { InputType } from '../enums/input-type.enum';
import { MeasurementUnit } from '../enums/measurement-unit.enum';
import { PricingType } from '../enums/pricing-type.enum';

@Schema({ _id: false })
export class TailoringServiceConfiguration {
  @Prop({ required: true, trim: true })
  serviceId!: string;

  @Prop({ type: Number, required: true, min: 0 })
  basePrice!: number;
}

@Schema({ _id: false })
export class CustomizationOptionConfiguration {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: InputType, required: true })
  inputType!: InputType;

  @Prop({ type: Number, required: true, min: 0 })
  price!: number;

  @Prop({ type: String, enum: PricingType, required: true })
  pricingType!: PricingType;

  @Prop({ type: Number, required: true, min: 0 })
  sortOrder!: number;
}

@Schema({ _id: false })
export class CustomizationGroupConfiguration {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: Number, required: true, min: 0 })
  sortOrder!: number;

  @Prop({ type: [CustomizationOptionConfiguration], required: true })
  options!: CustomizationOptionConfiguration[];
}

@Schema({ _id: false })
export class MeasurementFieldConfiguration {
  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: MeasurementUnit, required: true })
  unit!: MeasurementUnit;

  @Prop({ type: Boolean, required: true })
  required!: boolean;

  @Prop({ type: Number, required: true, min: 0 })
  sortOrder!: number;
}

export type GarmentTypeDocument = HydratedDocument<GarmentType> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true, versionKey: false })
export class GarmentType {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    match: /^GRT-\d{6}$/,
    immutable: true,
  })
  garmentTypeId!: string;

  @Prop({ required: true, unique: true, index: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: TailoringServiceConfiguration, required: true })
  tailoringService!: TailoringServiceConfiguration;

  @Prop({ type: [CustomizationGroupConfiguration], required: true })
  customizationGroups!: CustomizationGroupConfiguration[];

  @Prop({ type: [MeasurementFieldConfiguration], required: true })
  measurementFields!: MeasurementFieldConfiguration[];

  @Prop({ required: true, default: true, index: true })
  isActive!: boolean;

  @Prop({ type: String, ref: 'User', required: true, trim: true, immutable: true })
  createdBy!: string;

  @Prop({ type: String, ref: 'User', required: true, trim: true })
  updatedBy!: string;
}

export const GarmentTypeSchema = SchemaFactory.createForClass(GarmentType);

GarmentTypeSchema.index({ name: 1 }, { unique: true });
GarmentTypeSchema.index({ code: 1 }, { unique: true });
