import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { globalThrottlerGuardProvider } from './throttling';

describe('global throttling configuration', () => {
  it('defines exactly one global ThrottlerGuard provider', () => {
    expect(globalThrottlerGuardProvider).toEqual({
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    });
  });
});
