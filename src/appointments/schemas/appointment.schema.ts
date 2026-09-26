import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { AppointmentStatus } from '../enums/appointment-status.enum';
import { AppointmentType } from '../enums/appointment-type.enum';

export type AppointmentDocument = HydratedDocument<Appointment> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true, versionKey: false })
export class Appointment {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    match: /^APT-\d{6}$/,
  })
  appointmentId!: string;

  @Prop({
    type: String,
    ref: 'Customer',
    required: true,
    index: true,
    trim: true,
  })
  customerId!: string;

  @Prop({
    type: String,
    ref: 'Order',
    index: true,
    trim: true,
  })
  orderId?: string;

  @Prop({
    type: Date,
    required: true,
    index: true,
  })
  appointmentDate!: Date;

  @Prop({
    type: String,
    required: true,
    trim: true,
    match: /^(?:[01]\d|2[0-3]):[0-5]\d$/,
  })
  appointmentTime!: string;

  @Prop({
    type: String,
    enum: AppointmentType,
    required: true,
  })
  type!: AppointmentType;

  @Prop({
    type: String,
    enum: AppointmentStatus,
    required: true,
    default: AppointmentStatus.SCHEDULED,
    index: true,
  })
  status!: AppointmentStatus;

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

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);
