import { NestFactory } from '@nestjs/core';
import { Controller, Get, Logger, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { Email, InAppNotification } from './entities/email.entity';
import { NotificationsService } from './notifications/notifications.service';
import { NotificationsController, InternalNotificationsController } from './notifications/notifications.controller';

@Controller('health')
class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}
  @Get()
  async check() {
    let dbOk = false;
    try { await this.ds.query('SELECT 1'); dbOk = true; } catch {}
    return { service: 'notification-service', status: dbOk ? 'ok' : 'degraded', timestamp: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: process.env.DATABASE_SCHEMA ?? 'notifications',
      entities: [Email, InAppNotification],
      synchronize: false,
      logging: ['error'],
    }),
    TypeOrmModule.forFeature([Email, InAppNotification]),
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-secret-CHANGE-ME' }),
  ],
  controllers: [HealthController, NotificationsController, InternalNotificationsController],
  providers: [NotificationsService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api', { exclude: ['health'] });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Notification Service')
      .setDescription('Emails via MailHog + in-app notifications')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3006);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Notification service listening on port ${port}`, 'Bootstrap');
}

bootstrap();
