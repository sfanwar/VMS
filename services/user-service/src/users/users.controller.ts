import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './users.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PersonaGuard, RequirePersona } from '../common/guards/persona.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Internal endpoint — called by auth-service after a successful login
   * to fetch full profile + personas. Protected by a shared internal key.
   */
  @Get('internal/users/:id/profile')
  @ApiOperation({ summary: '[Internal] Get user profile (auth-service only)' })
  async internalProfile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-internal-key') key: string,
  ) {
    const expected = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';
    if (!key || key !== expected) {
      throw new UnauthorizedException({ errorCode: 'INVALID_INTERNAL_KEY', message: 'Service-to-service auth failed' });
    }
    return this.users.findByIdWithPersonas(id);
  }

  @Get('users/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user with personas' })
  async me(@CurrentUser() current: AuthenticatedUser) {
    return this.users.findByIdWithPersonas(current.id);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all users (System Administrator only)' })
  async list() {
    return this.users.list();
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, PersonaGuard)
  @RequirePersona('SYSADMIN') // user provisioning is a System Administrator function
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new user (System Administrator only)' })
  async create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard, PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a user: profile, personas, or active status (System Administrator only)' })
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post('users/:id/reset-password')
  @UseGuards(JwtAuthGuard, PersonaGuard)
  @RequirePersona('SYSADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Reset a user's password (System Administrator only)" })
  async resetPassword(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ResetPasswordDto) {
    await this.users.resetPassword(id, dto.password);
    return { status: 'reset' };
  }

  @Get('personas')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all personas' })
  async listPersonas() {
    return this.users.listPersonas();
  }
}
