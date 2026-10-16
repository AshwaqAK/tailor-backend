import { BadRequestException } from '@nestjs/common';

import { cursorPredicate, decodeCursor, encodeCursor } from './cursor';

describe('cursor pagination', () => {
  it('round-trips date cursors and preserves sort configuration', () => {
    const cursor = encodeCursor('createdAt', 'desc', new Date('2026-01-01T00:00:00.000Z'), 'CUS-000001');

    expect(decodeCursor(cursor, 'createdAt', 'desc')).toEqual({
      value: new Date('2026-01-01T00:00:00.000Z'),
      id: 'CUS-000001',
    });
  });

  it('rejects malformed or incompatible cursors', () => {
    expect(() => decodeCursor('not-a-cursor', 'createdAt', 'desc')).toThrow(BadRequestException);

    const cursor = encodeCursor('createdAt', 'desc', '2026-01-01', 'CUS-000001');
    expect(() => decodeCursor(cursor, 'name', 'desc')).toThrow(BadRequestException);
  });

  it('builds a keyset predicate using both the sort value and tie-breaker', () => {
    const cursor = decodeCursor(
      encodeCursor('createdAt', 'desc', '2026-01-01', 'CUS-000001'),
      'createdAt',
      'desc',
    );

    expect(cursorPredicate('createdAt', 'customerId', 'desc', cursor)).toEqual({
      $or: [
        { createdAt: { $lt: '2026-01-01' } },
        { createdAt: '2026-01-01', customerId: { $lt: 'CUS-000001' } },
      ],
    });
  });
});
