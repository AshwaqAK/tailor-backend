import { validateEnvironment } from './env.validation';

const validEnvironment = () => ({
  NODE_ENV: 'test',
  PORT: '3000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/tailor_test',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
  AUTH_COOKIE_NAME: 'refreshToken',
  AUTH_COOKIE_SECURE: 'false',
  AUTH_COOKIE_SAME_SITE: 'lax',
});

describe('validateEnvironment', () => {
  it('normalizes a valid environment without exposing secrets', () => {
    const result = validateEnvironment(validEnvironment());

    expect(result).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3000,
      AUTH_COOKIE_SECURE: false,
      AUTH_COOKIE_SAME_SITE: 'lax',
    });
    expect(result.JWT_ACCESS_SECRET).toBe('a'.repeat(32));
  });

  it.each([
    ['MONGODB_URI', ''],
    ['JWT_ACCESS_SECRET', 'short'],
    ['JWT_REFRESH_SECRET', 'short'],
    ['CORS_ORIGIN', 'not-a-url'],
    ['AUTH_COOKIE_SECURE', 'yes'],
    ['AUTH_COOKIE_SAME_SITE', 'invalid'],
    ['JWT_ACCESS_EXPIRES_IN', '15 minutes'],
  ])('rejects invalid %s', (key, value) => {
    const environment = validEnvironment();
    if (key.startsWith('JWT_')) {
      environment.NODE_ENV = 'production';
    }
    environment[key as keyof typeof environment] = value;

    expect(() => validateEnvironment(environment)).toThrow();
  });

  it('requires stronger secrets for production without including secret values in errors', () => {
    const environment = validEnvironment();
    environment.NODE_ENV = 'production';
    environment.JWT_ACCESS_SECRET = 'secret';

    expect(() => validateEnvironment(environment)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnvironment(environment)).toThrow(/too weak/);
    expect(() => validateEnvironment(environment)).not.toThrow('secret');
  });

  it('allows explicitly supplied development secrets without applying production strength rules', () => {
    const environment = validEnvironment();
    environment.JWT_ACCESS_SECRET = 'secret';
    environment.JWT_REFRESH_SECRET = 'secret';

    expect(() => validateEnvironment(environment)).not.toThrow();
  });

  it('requires secure cookies when SameSite is none', () => {
    const environment = validEnvironment();
    environment.AUTH_COOKIE_SAME_SITE = 'none';

    expect(() => validateEnvironment(environment)).toThrow(/AUTH_COOKIE_SECURE/);
  });
});
