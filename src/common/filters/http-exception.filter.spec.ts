/// <reference types="jest" />

import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });

    const response = { status, json } as unknown as Response;
    host = {
      switchToHttp: () => ({
        getRequest: jest.fn(),
        getResponse: () => response,
        getNext: jest.fn(),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('formats an HTTP exception using its status and message', () => {
    filter.catch(new UnauthorizedException('Authentication required'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Authentication required',
    });
  });

  it('preserves validation message arrays', () => {
    const messages = ['fromDate must be a valid ISO date', 'property extra should not exist'];

    filter.catch(new BadRequestException(messages), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: messages,
    });
  });

  it('hides unexpected error details behind the standard server error response', () => {
    filter.catch(new Error('database connection details'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
    });
  });
});
