import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { InternalController } from './internal.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Credential } from './entities/credential.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { LoginAudit } from './entities/login-audit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Credential, RefreshToken, LoginAudit]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-CHANGE-ME',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' },
    }),
  ],
  controllers: [AuthController, InternalController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
