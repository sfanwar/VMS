import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { VisaRequest } from './entities/visa-request.entity';
import { Beneficiary } from './entities/beneficiary.entity';
import { RequestsService } from './requests/requests.service';
import { RequestsController } from './requests/requests.controller';
import { InternalRequestsController } from './requests/internal-requests.controller';

@Controller('health')
class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}
  @Get()
  async check() {
    let dbOk = false;
    try { await this.ds.query('SELECT 1'); dbOk = true; } catch {}
    return { service: 'request-service', status: dbOk ? 'ok' : 'degraded', timestamp: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: process.env.DATABASE_SCHEMA ?? 'requests',
      entities: [VisaRequest, Beneficiary],
      synchronize: false,
      logging: ['error'],
    }),
    TypeOrmModule.forFeature([VisaRequest, Beneficiary]),
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-secret-CHANGE-ME' }),
  ],
  controllers: [HealthController, RequestsController, InternalRequestsController],
  providers: [RequestsService],
})
export class AppModule {}
