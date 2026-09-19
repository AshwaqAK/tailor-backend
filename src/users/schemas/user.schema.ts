import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Role } from '../../common/constants/role.enum';

export type UserDocument = HydratedDocument<User> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({
  timestamps: true,
  versionKey: false,
})
export class User {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  userId!: string;

  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  })
  email!: string;

  @Prop({
    trim: true,
  })
  phone?: string;

  @Prop({
    required: true,
    select: false,
  })
  passwordHash!: string;

  @Prop({
    required: true,
    enum: Role,
    default: Role.RECEPTIONIST,
  })
  role!: Role;

  @Prop({
    required: true,
    default: true,
    index: true,
  })
  isActive!: boolean;

  @Prop({
    type: String,
    select: false,
    default: null,
  })
  refreshTokenHash?: string | null;

  @Prop({
    type: Date,
    default: null,
  })
  lastLoginAt?: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
