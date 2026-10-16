/// <reference types="jest" />

import 'reflect-metadata';
import mongoose, { Model } from 'mongoose';

jest.mock('@nestjs/mongoose', () => {
  const actualMongoose = jest.requireActual<typeof import('mongoose')>('mongoose');
  const properties = new WeakMap<object, Record<string, unknown>>();
  const schemaOptions = new WeakMap<object, Record<string, unknown>>();

  return {
    Prop:
      (options: Record<string, unknown> = {}) =>
      (target: object, propertyKey: string): void => {
        const definition = properties.get(target.constructor) ?? {};
        definition[propertyKey] = {
          type:
            options.type ?? (Reflect.getMetadata('design:type', target, propertyKey) as unknown),
          ...options,
        };
        properties.set(target.constructor, definition);
      },
    Schema:
      (options: Record<string, unknown> = {}) =>
      <T extends object>(target: T): T => {
        schemaOptions.set(target, options);
        return target;
      },
    SchemaFactory: {
      createForClass: (target: object) =>
        new actualMongoose.Schema(properties.get(target) ?? {}, schemaOptions.get(target) ?? {}),
    },
  };
});

import { AuditAction } from '../enums/audit-action.enum';
import { AuditActorType } from '../enums/audit-actor-type.enum';
import { AuditEntityType } from '../enums/audit-entity-type.enum';
import { AuditLog, AuditLogSchema } from './audit-log.schema';

describe('AuditLog schema', () => {
  let auditLogModel: Model<AuditLog>;

  const validData = (overrides: Record<string, unknown> = {}) => ({
    auditId: 'AUD-000001',
    actorType: AuditActorType.USER,
    actorId: 'USR-000001',
    action: AuditAction.UPDATED,
    entityType: AuditEntityType.ORDER,
    entityId: 'ORD-000001',
    ...overrides,
  });

  beforeAll(() => {
    auditLogModel = mongoose.model<AuditLog>('AuditLogSchemaValidation', AuditLogSchema);
  });

  afterAll(() => {
    delete mongoose.models.AuditLogSchemaValidation;
  });

  it('accepts a valid audit event and applies the event timestamp', () => {
    const auditLog = new auditLogModel(validData());

    expect(auditLog.validateSync()).toBeUndefined();
    expect(auditLog.eventAt).toBeInstanceOf(Date);
    expect(auditLog.actorType).toBe(AuditActorType.USER);
  });

  it.each(['auditId', 'action', 'entityType', 'entityId'])('requires %s', (field) => {
    const data = validData();
    delete data[field];

    expect(new auditLogModel(data).validateSync()?.errors[field]).toBeDefined();
  });

  it('supports an explicit system event without an actor reference', () => {
    const auditLog = new auditLogModel(
      validData({ actorType: AuditActorType.SYSTEM, actorId: undefined }),
    );

    expect(auditLog.validateSync()).toBeUndefined();
    expect(auditLog.actorId).toBeUndefined();
  });

  it('requires a user reference for user-acted events', () => {
    const auditLog = new auditLogModel(validData({ actorId: undefined }));

    expect(auditLog.validateSync()?.errors.actorId).toBeDefined();
  });

  it('rejects invalid enum values and unsafe metadata', () => {
    const auditLog = new auditLogModel(
      validData({
        action: 'DELETED',
        entityType: 'INVOICE',
        metadata: { before: { passwordHash: 'do-not-store' } },
      }),
    );

    const errors = auditLog.validateSync()?.errors;
    expect(errors?.action).toBeDefined();
    expect(errors?.entityType).toBeDefined();
    expect(errors?.metadata).toBeDefined();
  });

  it('accepts optional safe metadata and keeps event timestamps immutable', () => {
    const eventAt = new Date('2026-10-16T00:00:00.000Z');
    const auditLog = new auditLogModel(
      validData({
        eventAt,
        metadata: { before: { status: 'DRAFT' }, after: { status: 'CONFIRMED' } },
      }),
    );

    expect(auditLog.validateSync()).toBeUndefined();
    expect(auditLog.eventAt).toEqual(eventAt);
    expect(AuditLogSchema.path('eventAt').options.immutable).toBe(true);
    expect(AuditLogSchema.options.timestamps).toBe(true);
  });

  it('does not add unsupported request context fields', () => {
    const auditLog = new auditLogModel(validData({ requestId: 'request-123' }));

    expect(auditLog.validateSync()).toBeUndefined();
    expect((auditLog as AuditLog & { requestId?: string }).requestId).toBeUndefined();
  });

  it('defines filtering indexes without duplicate event-time indexes', () => {
    expect(AuditLogSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ eventAt: -1 }, expect.anything()],
        [{ actorId: 1, eventAt: -1 }, expect.anything()],
        [{ entityType: 1, entityId: 1, eventAt: -1 }, expect.anything()],
        [{ action: 1, eventAt: -1 }, expect.anything()],
      ]),
    );
  });
});
