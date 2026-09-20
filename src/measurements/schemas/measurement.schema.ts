import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { ClothingType } from '../enums/clothing-type.enum';
import { FitPreference } from '../enums/fit-preference.enum';

export type MeasurementDocument = HydratedDocument<Measurement> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Measurement {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Customer',
    required: true,
  })
  customerId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ClothingType,
    required: true,
  })
  clothingType!: ClothingType;

  @Prop({
    required: true,
    min: 1,
  })
  version!: number;

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

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy!: Types.ObjectId;
}

export const MeasurementSchema = SchemaFactory.createForClass(Measurement);

MeasurementSchema.index(
  {
    customerId: 1,
    clothingType: 1,
    version: 1,
  },
  {
    unique: true,
  },
);

MeasurementSchema.index({
  customerId: 1,
  clothingType: 1,
  version: -1,
});
