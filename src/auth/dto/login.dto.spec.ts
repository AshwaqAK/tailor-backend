/// <reference types="jest" />

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('accepts a valid email and string password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'Password1!',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'not-an-email',
      password: 'Password1!',
    });

    const errors = await validate(dto);
    const emailError = errors.find((error) => error.property === 'email');

    expect(emailError?.constraints?.isEmail).toBeDefined();
  });
});
