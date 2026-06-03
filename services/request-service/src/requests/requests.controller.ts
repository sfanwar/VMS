import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestsService } from './requests.service';
import { CreateRequestDto, UpdateRequestDto, UpdateFeesDto, UpdateBeneficiaryVisaDto, ListRequestsQueryDto } from '../dto/request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PersonaGuard, RequirePersona } from '../common/guards/persona.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
@UseGuards(JwtAuthGuard)
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Post()
  @UseGuards(PersonaGuard)
  @RequirePersona('OFFICE', 'SENIOR_ADMIN') // BRD §5.2: both can create
  @ApiOperation({ summary: 'Create a new draft visa request' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'List requests (RBAC: Office sees own only)' })
  list(@Query() query: ListRequestsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one request with beneficiaries' })
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findByIdForActor(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update draft request fields' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Patch(':id/fees')
  @UseGuards(PersonaGuard)
  @RequirePersona('TYPIST')
  @ApiOperation({ summary: 'Update fees (Typist only)' })
  updateFees(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFeesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.updateFees(id, dto, actor);
  }

  @Patch(':id/beneficiaries/:bid')
  @UseGuards(PersonaGuard)
  @RequirePersona('TYPIST')
  @ApiOperation({ summary: 'Update a beneficiary visa info — number, issue date, appointment (Typist only)' })
  updateBeneficiaryVisa(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('bid', new ParseUUIDPipe()) bid: string,
    @Body() dto: UpdateBeneficiaryVisaDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.updateBeneficiaryVisa(id, bid, dto, actor);
  }
}
