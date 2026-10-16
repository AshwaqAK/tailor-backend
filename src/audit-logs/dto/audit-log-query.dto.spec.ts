import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AuditAction } from '../enums/audit-action.enum';
import { AuditEntityType } from '../enums/audit-entity-type.enum';
import { AuditLogQueryDto } from './audit-log-query.dto';

describe('AuditLogQueryDto', () => {
  it('accepts bounded pagination and supported filters', async () => {
    const query = plainToInstance(AuditLogQueryDto, {
      page: '2',
      limit: '25',
      actorId: 'USR-000001',
      action: AuditAction.UPDATED,
      entityType: AuditEntityType.ORDER,
      entityId: 'ORD-000001',
      fromDate: '2026-10-01',
      toDate: '2026-10-16',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.page).toBe(2);
    expect(query.limit).toBe(25);
  });

  it('rejects invalid identifiers, enums, ranges, and unbounded limits', async () => {
    const query = plainToInstance(AuditLogQueryDto, {
      page: '0',
      limit: '101',
      actorId: 'user-1',
      action: 'DELETED',
      entityType: 'INVOICE',
      fromDate: '2026-10-18',
      toDate: '2026-10-16',
    });

    const errors = await validate(query);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit', 'actorId', 'action', 'entityType', 'toDate']),
    );
  });
});
