import {
  Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query,
  UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

class SendEmailDto {
  @IsArray() @ArrayMinSize(1) @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional() @IsArray() @IsEmail({}, { each: true })
  cc?: string[];

  @IsString() @MaxLength(500)
  subject!: string;

  @IsString() @MaxLength(20000)
  bodyText!: string;

  @IsOptional() @IsString() @MaxLength(50000)
  bodyHtml?: string;

  @IsOptional() @IsUUID()
  requestId?: string;
}

class WorkflowEventDto {
  @IsUUID() requestId!: string;
  @IsString() action!: string;
  @IsString() newStatus!: string;
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send an ad-hoc email (the BRD "Actions" button)' })
  async sendEmail(@Body() dto: SendEmailDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.enqueueEmail({
      requestId: dto.requestId,
      sentBy: actor.id,
      to: dto.to,
      cc: dto.cc,
      subject: dto.subject,
      bodyText: dto.bodyText,
      bodyHtml: dto.bodyHtml,
    });
  }

  @Get('emails')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List emails sent for a request' })
  list(@Query('requestId', new ParseUUIDPipe()) requestId: string) {
    return this.notifications.listEmailsForRequest(requestId);
  }

  @Get('in-app/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'In-app notification feed for the current user' })
  mine(@CurrentUser() actor: AuthenticatedUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.listForUser(actor.id, unreadOnly === 'true');
  }

  @Patch('in-app/:id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark an in-app notification as read' })
  async markRead(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.notifications.markRead(id, actor.id);
    return { ok: true };
  }
}

@ApiTags('internal')
@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('workflow-event')
  @ApiOperation({ summary: '[Internal] Workflow service triggers a notification on transition' })
  async workflowEvent(@Body() dto: WorkflowEventDto, @Headers('x-internal-key') key: string) {
    const expected = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';
    if (!key || key !== expected) throw new UnauthorizedException();

    // For the scaffold, we send to a configured FAD inbox. In production, look up actors via user-service.
    const fadInbox = process.env.FAD_NOTIFICATION_EMAIL ?? 'fad-team@visa-management.local';

    await this.notifications.enqueueEmail({
      requestId: dto.requestId,
      sentBy: '00000000-0000-0000-0000-000000000000',
      to: [fadInbox],
      templateCode: dto.action,
      templateContext: {
        requestNumber: dto.requestId.slice(0, 8),
        newStatus: dto.newStatus,
      },
    });
    return { queued: true };
  }
}
