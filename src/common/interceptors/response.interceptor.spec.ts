/// <reference types="jest" />

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const context = {} as ExecutionContext;

  it('wraps handler data in the standard success response', async () => {
    const interceptor = new ResponseInterceptor<{ id: string }>();
    const next: CallHandler<{ id: string }> = {
      handle: () => of({ id: 'CUS-000001' }),
    };

    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      success: true,
      data: { id: 'CUS-000001' },
    });
  });

  it('preserves null response data', async () => {
    const interceptor = new ResponseInterceptor<null>();
    const next: CallHandler<null> = {
      handle: () => of(null),
    };

    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      success: true,
      data: null,
    });
  });
});
