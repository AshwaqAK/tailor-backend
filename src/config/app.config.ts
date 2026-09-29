import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const configuredLowStockThreshold = Number(
    process.env.FABRIC_LOW_STOCK_THRESHOLD ?? '5',
  );

  return {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    fabricLowStockThreshold:
      Number.isFinite(configuredLowStockThreshold) && configuredLowStockThreshold >= 0
        ? configuredLowStockThreshold
        : 5,
  };
});
