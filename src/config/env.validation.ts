const allowedEnvironments = new Set(['development', 'test', 'staging', 'production']);
const expiryPattern = /^\d+(?:ms|s|m|h|d|w|y)$/;
const mongoProtocols = new Set(['mongodb:', 'mongodb+srv:']);

function requiredString(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`);
  }

  return value.trim();
}

function validateBoolean(env: Record<string, unknown>, key: string, fallback: string): string {
  const value = typeof env[key] === 'undefined' ? fallback : env[key];
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${key} must be true or false`);
  }

  return value;
}

function validateUrl(value: string, key: string, protocols: readonly string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }

  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${key} must use an allowed URL protocol`);
  }

  return value;
}

export function validateEnvironment(env: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv =
    env.NODE_ENV === undefined ? 'development' : requiredString(env, 'NODE_ENV');
  if (!allowedEnvironments.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, staging, or production');
  }

  const rawPort = env.PORT === undefined ? '3000' : requiredString(env, 'PORT');
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const mongoUri = requiredString(env, 'MONGODB_URI');
  validateUrl(mongoUri, 'MONGODB_URI', [...mongoProtocols]);

  const accessSecret = requiredString(env, 'JWT_ACCESS_SECRET');
  const refreshSecret = requiredString(env, 'JWT_REFRESH_SECRET');
  const productionLike = nodeEnv === 'production' || nodeEnv === 'staging';
  const minimumSecretLength = 32;

  for (const [key, secret] of [
    ['JWT_ACCESS_SECRET', accessSecret],
    ['JWT_REFRESH_SECRET', refreshSecret],
  ] as const) {
    if (
      productionLike &&
      (secret.length < minimumSecretLength || /^(?:secret|password|changeme|replace)/i.test(secret))
    ) {
      throw new Error(`${key} is too weak for ${nodeEnv}`);
    }
  }

  const accessExpiresIn = requiredString(env, 'JWT_ACCESS_EXPIRES_IN');
  const refreshExpiresIn = requiredString(env, 'JWT_REFRESH_EXPIRES_IN');
  if (!expiryPattern.test(accessExpiresIn) || !expiryPattern.test(refreshExpiresIn)) {
    throw new Error('JWT expiry values must use a numeric duration such as 15m or 7d');
  }

  const corsOrigin = requiredString(env, 'CORS_ORIGIN');
  validateUrl(corsOrigin, 'CORS_ORIGIN', ['http:', 'https:']);

  const cookieName =
    env.AUTH_COOKIE_NAME === undefined
      ? 'refreshToken'
      : requiredString(env, 'AUTH_COOKIE_NAME');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(cookieName)) {
    throw new Error('AUTH_COOKIE_NAME must contain only letters, numbers, underscores, or hyphens');
  }

  const cookieSecure = validateBoolean(env, 'AUTH_COOKIE_SECURE', productionLike ? 'true' : 'false');
  const sameSite =
    (env.AUTH_COOKIE_SAME_SITE === undefined
      ? 'lax'
      : requiredString(env, 'AUTH_COOKIE_SAME_SITE')
    ).toLowerCase();
  if (!['strict', 'lax', 'none'].includes(sameSite)) {
    throw new Error('AUTH_COOKIE_SAME_SITE must be strict, lax, or none');
  }
  if (sameSite === 'none' && cookieSecure !== 'true') {
    throw new Error('AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none');
  }

  if (env.FABRIC_LOW_STOCK_THRESHOLD !== undefined) {
    const threshold = Number(env.FABRIC_LOW_STOCK_THRESHOLD);
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error('FABRIC_LOW_STOCK_THRESHOLD must be a non-negative number');
    }
  }

  return {
    ...env,
    NODE_ENV: nodeEnv,
    PORT: port,
    MONGODB_URI: mongoUri,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_EXPIRES_IN: accessExpiresIn,
    JWT_REFRESH_EXPIRES_IN: refreshExpiresIn,
    CORS_ORIGIN: corsOrigin,
    AUTH_COOKIE_NAME: cookieName,
    AUTH_COOKIE_SECURE: cookieSecure === 'true',
    AUTH_COOKIE_SAME_SITE: sameSite,
  };
}
