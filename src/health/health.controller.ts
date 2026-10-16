import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  checkLiveness() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  checkReadiness() {
    return this.health.check([() => this.mongoose.pingCheck('mongodb', { timeout: 1000 })]);
  }
}
