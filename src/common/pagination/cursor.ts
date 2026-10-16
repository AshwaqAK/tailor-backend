import { BadRequestException } from '@nestjs/common';

export type CursorSortOrder = 'asc' | 'desc';
export type CursorValueType = 'date' | 'number' | 'string';

interface CursorPayload {
  v: 1;
  sortBy: string;
  sortOrder: CursorSortOrder;
  value: string | number;
  valueType: CursorValueType;
  id: string;
}

export interface DecodedCursor {
  value: Date | number | string;
  id: string;
}

export interface CursorPageMeta {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

export function encodeCursor(
  sortBy: string,
  sortOrder: CursorSortOrder,
  value: Date | number | string,
  id: string,
): string {
  const valueType: CursorValueType = value instanceof Date
    ? 'date'
    : typeof value === 'number'
      ? 'number'
      : 'string';

  const payload: CursorPayload = {
    v: 1,
    sortBy,
    sortOrder,
    value: value instanceof Date ? value.toISOString() : value,
    valueType,
    id,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(
  cursor: string,
  sortBy: string,
  sortOrder: CursorSortOrder,
): DecodedCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

    if (!parsed || typeof parsed !== 'object') throw new Error('shape');
    const payload = parsed as Partial<CursorPayload>;

    if (
      payload.v !== 1 ||
      payload.sortBy !== sortBy ||
      payload.sortOrder !== sortOrder ||
      !payload.id ||
      !payload.valueType ||
      (typeof payload.value !== 'string' && typeof payload.value !== 'number')
    ) {
      throw new Error('shape');
    }

    let value: Date | number | string = payload.value;
    if (payload.valueType === 'date') {
      value = new Date(payload.value);
      if (!Number.isFinite(value.getTime())) throw new Error('date');
    } else if (payload.valueType === 'number') {
      if (typeof payload.value !== 'number' || !Number.isFinite(payload.value)) {
        throw new Error('number');
      }
    } else if (payload.valueType !== 'string' || typeof payload.value !== 'string') {
      throw new Error('string');
    }

    return { value, id: payload.id };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

export function cursorPredicate(
  field: string,
  idField: string,
  sortOrder: CursorSortOrder,
  cursor: DecodedCursor,
): Record<string, unknown> {
  const operator = sortOrder === 'asc' ? '$gt' : '$lt';
  return {
    $or: [
      { [field]: { [operator]: cursor.value } },
      { [field]: cursor.value, [idField]: { [operator]: cursor.id } },
    ],
  };
}

export function withCursorFilter(
  filter: Record<string, unknown>,
  predicate: Record<string, unknown>,
): Record<string, unknown> {
  return Object.keys(filter).length ? { $and: [filter, predicate] } : predicate;
}

