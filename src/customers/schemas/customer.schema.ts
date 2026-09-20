import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { Gender } from '../enums/gender.enum';

export type CustomerDocument = HydratedDocument<Customer> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Customer {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  customerId!: string;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  name!: string;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  phone!: string;

  @Prop({
    trim: true,
  })
  alternatePhone?: string;

  @Prop({
    trim: true,
    lowercase: true,
  })
  email?: string;

  @Prop({
    type: String,
    enum: Gender,
    default: Gender.MALE,
  })
  gender!: Gender;

  @Prop({
    trim: true,
  })
  photo?: string;

  @Prop({
    trim: true,
  })
  notes?: string;

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
    index: true,
  })
  createdBy!: string

  @Prop({
    type: String,
    ref: 'User',
    required: true,
    index: true,
  })
  updatedBy!: string
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
