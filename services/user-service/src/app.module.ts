import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Office } from './entities/office.entity';
import { OfficeContact } from './entities/office-contact.entity';
import { Persona, UserPersona } from './entities/user-persona.entity';
import { Country, VisaType } from './entities/reference.entity';
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { OfficesService } from './offices/offices.service';
import { OfficesController } from './offices/offices.controller';
import { ReferenceController } from './reference/reference.controller';
import { ReferenceService } from './reference/reference.service';

@Controller('health')
class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}
  @Get()
  async check() {
    let dbOk = false;
    try { await this.ds.query('SELECT 1'); dbOk = true; } catch {}
    return { service: 'user-service', status: dbOk ? 'ok' : 'degraded', timestamp: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: process.env.DATABASE_SCHEMA ?? 'users',
      entities: [User, Office, OfficeContact, Persona, UserPersona, Country, VisaType],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    }),
    TypeOrmModule.forFeature([User, Office, OfficeContact, Persona, UserPersona, Country, VisaType]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-CHANGE-ME',
    }),
  ],
  controllers: [HealthController, UsersController, OfficesController, ReferenceController],
  providers: [UsersService, OfficesService, ReferenceService],
})
export class AppModule {}
