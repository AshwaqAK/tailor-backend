import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import { User } from '../../users/schemas/user.schema';
import { AuditAction } from '../enums/audit-action.enum';
import { AuditActorType } from '../enums/audit-actor-type.enum';
import { AuditEntityType } from '../enums/audit-entity-type.enum';

const FORBIDDEN_METADATA_KEYS = new Set([
  'password',
  'passwordhash',
  'accesstoken',
  'refreshtoken',
  'token',
  'secret',
  'cardnumber',
  'cvv',
  'cvc',
]);

export function sanitizeAuditMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const sanitized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_METADATA_KEYS.has(key.replace(/[_-]/g, '').toLowerCase()))
      .map(([key, nestedValue]) => [key, sanitizeMetadataValue(nestedValue)]),
  );

  return sanitized;
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return sanitizeAuditMetadata(value);
}

function containsForbiddenMetadataKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenMetadataKey);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    return (
      FORBIDDEN_METADATA_KEYS.has(key.replace(/[_-]/g, '').toLowerCase()) ||
      containsForbiddenMetadataKey(nestedValue)
    );
  });
}

function isSafeMetadata(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)) &&
    !containsForbiddenMetadataKey(value);
}

export type AuditLogDocument = HydratedDocument<AuditLog> & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({
  timestamps: true,
  versionKey: false,
})
export class AuditLog {
  @Prop({
    required: true,
    unique: true,
    index: true,
    immutable: true,
    trim: true,
    match: /^AUD-\d{6}$/,
  })
  auditId!: string;

  @Prop({
    type: String,
    enum: AuditActorType,
    required: true,
    default: AuditActorType.SYSTEM,
    index: true,
    immutable: true,
  })
  actorType!: AuditActorType;

  @Prop({
    type: String,
    ref: User.name,
    index: true,
    trim: true,
    match: /^USR-\d{6}$/,
    immutable: true,
    required: function (this: AuditLog): boolean {
      return this.actorType === AuditActorType.USER;
    },
  })
  actorId?: string;

  @Prop({
    type: String,
    enum: AuditAction,
    required: true,
    index: true,
    immutable: true,
  })
  action!: AuditAction;

  @Prop({
    type: String,
    enum: AuditEntityType,
    required: true,
    index: true,
    immutable: true,
  })
  entityType!: AuditEntityType;

  @Prop({
    type: String,
    required: true,
    trim: true,
    immutable: true,
  })
  entityId!: string;

  @Prop({
    type: Date,
    required: true,
    default: Date.now,
    index: true,
    immutable: true,
  })
  eventAt!: Date;

  @Prop({
    type: SchemaTypes.Mixed,
    validate: {
      validator: isSafeMetadata,
      message: 'metadata must be a safe structured object without secrets',
    },
    immutable: true,
  })
  metadata?: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ eventAt: -1 });
AuditLogSchema.index({ actorId: 1, eventAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, eventAt: -1 });
AuditLogSchema.index({ action: 1, eventAt: -1 });
