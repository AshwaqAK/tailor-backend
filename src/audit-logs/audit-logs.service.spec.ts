import 'reflect-metadata';

import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => () => undefined,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

import { AuditAction } from './enums/audit-action.enum';
import { AuditEntityType } from './enums/audit-entity-type.enum';
import { AuditLogsService } from './audit-logs.service';

describe('AuditLogsService', () => {
  const startSession = jest.fn();
  const auditLogModel = jest.fn();
  const counterModel = { findOneAndUpdate: jest.fn() };
  const service = new AuditLogsService(
    { startSession } as never,
    auditLogModel as never,
    counterModel as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();

    const session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(true),
      endSession: jest.fn(),
    };
    startSession.mockResolvedValue(session);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    auditLogModel.mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save: jest.fn().mockResolvedValue(data),
    }));
  });

  it('creates an internally generated audit event with a counter-backed ID', async () => {
    const result = await service.record({
      actorId: 'USR-000001',
      action: AuditAction.UPDATED,
      entityType: AuditEntityType.ORDER,
      entityId: 'ORD-000001',
      metadata: { status: 'CONFIRMED' },
    });

    expect(result).toMatchObject({
      auditId: 'AUD-000007',
      actorType: 'USER',
      actorId: 'USR-000001',
      action: AuditAction.UPDATED,
      entityType: AuditEntityType.ORDER,
    });
    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'audit-log' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({ session: expect.anything(), upsert: true, new: true }),
    );
  });

  it('creates an explicit system event without an actor ID', async () => {
    const result = await service.record({
      action: AuditAction.CREATED,
      entityType: AuditEntityType.FABRIC,
      entityId: 'FAB-000001',
    });

    expect(result).toMatchObject({ actorType: 'SYSTEM' });
    expect(result).not.toHaveProperty('actorId');
  });

  it('sanitizes sensitive metadata without storing the secret values', async () => {
    const result = await service.record({
      action: AuditAction.PAYMENT_RECORDED,
      entityType: AuditEntityType.PAYMENT,
      entityId: 'PAY-000001',
      metadata: {
        amount: 250,
        passwordHash: 'hidden',
        nested: { accessToken: 'hidden', status: 'SUCCESS' },
      },
    });

    expect(result.metadata).toEqual({ amount: 250, nested: { status: 'SUCCESS' } });
  });

  it.each([
    [{ action: 'NOPE' }, 'Invalid audit action'],
    [{ entityType: 'INVOICE' }, 'Invalid audit entity type'],
    [{ entityId: '' }, 'A valid audit entity ID is required'],
    [{ actorId: 'user-1' }, 'actorId must be a valid user ID'],
  ])('rejects invalid internal event input %#', async (override, message) => {
    await expect(
      service.record({
        action: AuditAction.CREATED,
        entityType: AuditEntityType.ORDER,
        entityId: 'ORD-000001',
        ...override,
      } as never),
    ).rejects.toThrow(new BadRequestException(message));
  });

  it('lists filtered events with bounded pagination and deterministic newest-first sorting', async () => {
    const find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ auditId: 'AUD-000007' }]),
    });
    (auditLogModel as unknown as { find: typeof find }).find = find;
    (auditLogModel as unknown as { countDocuments: jest.Mock }).countDocuments = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(3) });

    const result = await service.findAll({
      page: 2,
      limit: 2,
      actorId: 'USR-000001',
      action: AuditAction.UPDATED,
      entityType: AuditEntityType.ORDER,
      entityId: 'ORD-000001',
      fromDate: '2026-10-01',
      toDate: '2026-10-16',
    });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'USR-000001',
        action: AuditAction.UPDATED,
        entityType: AuditEntityType.ORDER,
        entityId: 'ORD-000001',
        eventAt: expect.any(Object),
      }),
    );
    expect(find.mock.results[0].value.sort).toHaveBeenCalledWith({ eventAt: -1, auditId: -1 });
    expect(result.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('retrieves an event and reports missing events', async () => {
    (auditLogModel as unknown as { findOne: jest.Mock }).findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValueOnce({ auditId: 'AUD-000007' }).mockResolvedValueOnce(null),
    });

    await expect(service.findOne('AUD-000007')).resolves.toEqual({ auditId: 'AUD-000007' });
    await expect(service.findOne('AUD-000007')).rejects.toThrow(
      new NotFoundException('Audit log not found'),
    );
  });
});
