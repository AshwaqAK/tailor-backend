/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { parseReportDate, ReportDateQueryDto } from './report-date-query.dto';

describe('ReportDateQueryDto', () => {
  it.each([
    { fromDate: '2026-01-01' },
    { toDate: '2026-01-31' },
    { fromDate: '2026-01-01', toDate: '2026-01-31' },
    { fromDate: '2026-01-01T10:00:00Z', toDate: '2026-01-01T12:00:00Z' },
  ])('accepts valid date query %#', async (value) => {
    await expect(validate(plainToInstance(ReportDateQueryDto, value))).resolves.toHaveLength(0);
  });

  it.each([
    ['not-a-date', undefined],
    [undefined, '2026-13-40'],
    ['2026-01', '2026-01-31'],
  ])('rejects invalid dates from=%s to=%s', async (fromDate, toDate) => {
    const errors = await validate(plainToInstance(ReportDateQueryDto, { fromDate, toDate }));

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects fromDate later than toDate', async () => {
    const errors = await validate(
      plainToInstance(ReportDateQueryDto, {
        fromDate: '2026-02-01T00:00:00Z',
        toDate: '2026-01-31T23:59:59Z',
      }),
    );

    expect(errors.find((error) => error.property === 'toDate')?.constraints).toMatchObject({
      reportDateRange: 'fromDate must be earlier than or equal to toDate',
    });
  });

  it('accepts equal timestamp boundaries and the full toDate calendar day', async () => {
    await expect(
      validate(
        plainToInstance(ReportDateQueryDto, {
          fromDate: '2026-01-31T12:00:00Z',
          toDate: '2026-01-31T12:00:00Z',
        }),
      ),
    ).resolves.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(ReportDateQueryDto, {
          fromDate: '2026-01-31T23:59:59.999Z',
          toDate: '2026-01-31',
        }),
      ),
    ).resolves.toHaveLength(0);
  });

  it('normalizes date-only and offset timestamps to UTC boundaries', () => {
    expect(parseReportDate('2026-01-31')).toEqual(new Date('2026-01-31T00:00:00.000Z'));
    expect(parseReportDate('2026-01-31T00:30:00+05:30')).toEqual(
      new Date('2026-01-30T19:00:00.000Z'),
    );
    expect(parseReportDate('2026-01-31T00:30:00')).toEqual(new Date('2026-01-31T00:30:00.000Z'));
  });
});
