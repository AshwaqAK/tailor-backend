import { INestApplication } from '@nestjs/common';
import { HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from '../src/health/health.controller';

jest.mock('@nestjs/terminus', () => ({
  HealthCheck: () => () => undefined,
  HealthCheckService: class HealthCheckService {},
  MongooseHealthIndicator: class MongooseHealthIndicator {},
}));

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn().mockResolvedValue({ status: 'ok', info: {}, error: {} }),
          },
        },
        {
          provide: MongooseHealthIndicator,
          useValue: { pingCheck: jest.fn() },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health/live (GET)', () => {
    return request(app.getHttpServer()).get('/health/live').expect(200).expect({
      status: 'ok',
      info: {},
      error: {},
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
