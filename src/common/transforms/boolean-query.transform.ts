import type { TransformFnParams } from 'class-transformer';

export function transformBooleanQuery({ value }: TransformFnParams): unknown {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}
