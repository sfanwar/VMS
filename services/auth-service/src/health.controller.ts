import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Get()
  async check() {
    let dbOk = false;
    try {
      await this.ds.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      service: 'auth-service',
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { database: dbOk },
    };
  }
}
