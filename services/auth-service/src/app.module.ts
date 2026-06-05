import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { Credential } from './auth/entities/credential.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { LoginAudit } from './auth/entities/login-audit.entity';

// Global per-IP request limit (login has a tighter per-handler limit). Defaults
// to 100/min; override via AUTH_RATE_LIMIT (e.g. relaxed for the e2e suite).
const GLOBAL_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT) || 100;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: process.env.DATABASE_SCHEMA ?? 'auth',
      entities: [Credential, RefreshToken, LoginAudit],
      synchronize: false, // schema controlled by init.sql / migrations
      logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    }),

    // Rate limiting — GLOBAL_RATE_LIMIT/min default, tighter on /auth/login (set per-handler)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: GLOBAL_RATE_LIMIT }]),

    AuthModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
