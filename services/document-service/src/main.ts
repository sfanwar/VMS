import { NestFactory } from '@nestjs/core';
import { Controller, Get, Logger, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { Document } from './entities/document.entity';
import { DocumentsService } from './documents/documents.service';
import { DocumentsController, InternalDocumentsController } from './documents/documents.controller';
import { StorageService } from './documents/storage.service';

@Controller('health')
class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}
  @Get()
  async check() {
    let dbOk = false;
    try { await this.ds.query('SELECT 1'); dbOk = true; } catch {}
    return { service: 'document-service', status: dbOk ? 'ok' : 'degraded', timestamp: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: process.env.DATABASE_SCHEMA ?? 'documents',
      entities: [Document],
      synchronize: false,
      logging: ['error'],
    }),
    TypeOrmModule.forFeature([Document]),
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-secret-CHANGE-ME' }),
  ],
  controllers: [HealthController, DocumentsController, InternalDocumentsController],
  providers: [DocumentsService, StorageService],
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
      .setTitle('Document Service')
      .setDescription('File upload/download via MinIO with SHA-256 integrity')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3005);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Document service listening on port ${port}`, 'Bootstrap');
}

bootstrap();
