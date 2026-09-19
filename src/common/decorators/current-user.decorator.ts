import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { JwtPayload } from '../../auth/types/jwt-payload.type';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
