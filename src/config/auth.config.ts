import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cookie: {
    name: process.env.AUTH_COOKIE_NAME || 'refreshToken',
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    sameSite: process.env.AUTH_COOKIE_SAME_SITE || 'lax',
  },
}));
