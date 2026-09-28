import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { ServiceCategory } from '../enums/service-category.enum';

export type TailoringServiceDocument = HydratedDocument<TailoringService> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true, versionKey: false })
export class TailoringService {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    match: /^SRV-\d{6}$/,
    immutable: true,
  })
  serviceId!: string;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  name!: string;

  @Prop({
    trim: true,
  })
  description?: string;

  @Prop({
    type: String,
    enum: ServiceCategory,
    required: true,
    index: true,
  })
  category!: ServiceCategory;

  @Prop({
    type: Number,
    required: true,
    min: 0,
  })
  price!: number;

  @Prop({
    required: true,
    default: true,
    index: true,
  })
  isActive!: boolean;

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

export const TailoringServiceSchema = SchemaFactory.createForClass(TailoringService);
