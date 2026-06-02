import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Request } from 'express';
import { WorkflowService } from './workflow.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';
import { PersonaCode, RequestStatus, WorkflowAction, TRANSITION_TABLE } from '../state-machine/state-machine';

// Derive the validation allowlist directly from the state machine's transition
// table so the two can never drift apart. Previously this was a hand-maintained
// list that omitted EMBASSY_PROCESS, causing the embassy transition to be
// rejected by DTO validation before it ever reached the state machine.
const ACTIONS: WorkflowAction[] = Array.from(new Set(TRANSITION_TABLE.map((r) => r.action)));

class ExecuteTransitionDto {
  @IsUUID()
  requestId!: string;

  @IsEnum(ACTIONS)
  action!: WorkflowAction;

  @IsOptional() @IsString() @MaxLength(2000)
  comment?: string;
}

@ApiTags('workflow')
@ApiBearerAuth()
@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post('transitions')
  @ApiOperation({ summary: 'Execute a workflow transition' })
  execute(
    @Body() dto: ExecuteTransitionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.workflow.execute(dto, actor, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Get('requests/:id/history')
  @ApiOperation({ summary: 'Get full transition timeline for a request' })
  history(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.workflow.getHistory(id);
  }

  @Get('state-machine')
  @ApiOperation({ summary: 'Get the full transition graph (for UI rendering)' })
  stateMachine() {
    return this.workflow.getStateMachine();
  }

  @Get('next-actions')
  @ApiOperation({ summary: 'Get the actions available to the current user from a given state' })
  nextActions(
    @Query('status') status: RequestStatus,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return { actions: this.workflow.getNextActions(status, actor.personas as PersonaCode[]) };
  }
}
