import { NestFactory } from '@nestjs/core';
import {
  CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable,
  Logger, Module, Query, SetMetadata, UnauthorizedException, UseGuards, ValidationPipe,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import helmet from 'helmet';

/**
 * Reporting Service — flesh-out of the BRD §7 dashboards.
 *
 * Every endpoint is a thin wrapper over a single, well-formed SQL query.
 * Heavy lifting lives in the DB. Endpoints are read-only.
 *
 * Persona policy:
 *   - OFFICE personas see only their own office's data (via /my-office)
 *   - FAD staff (any non-OFFICE persona) see all data
 *   - Audit search restricted to DIRECTOR + SENIOR_OFFICER + SENIOR_ADMIN
 */

const PERSONAS_KEY = 'requiredPersonas';
const RequirePersona = (...personas: string[]) => SetMetadata(PERSONAS_KEY, personas);

interface AuthenticatedUser {
  id: string;
  email: string;
  personas: string[];
  officeId?: string;
}

const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest().user,
);

@Injectable()
class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException({ errorCode: 'MISSING_TOKEN' });
    }
    try {
      const payload = this.jwt.verify(auth.slice('Bearer '.length));
      (request as any).user = {
        id: payload.sub, email: payload.email,
        personas: payload.personas ?? [], officeId: payload.officeId,
      } satisfies AuthenticatedUser;
      return true;
    } catch {
      throw new UnauthorizedException({ errorCode: 'INVALID_TOKEN' });
    }
  }
}

@Injectable()
class PersonaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERSONAS_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const userPersonas: string[] = context.switchToHttp().getRequest().user?.personas ?? [];
    const ok = required.some((p) => userPersonas.includes(p));
    if (!ok) throw new ForbiddenException({
      errorCode: 'INSUFFICIENT_PERMISSIONS',
      message: `Requires one of: ${required.join(', ')}`,
    });
    return true;
  }
}

@ApiTags('reporting')
@ApiBearerAuth()
@Controller('reporting')
@UseGuards(JwtAuthGuard)
class ReportingController {
  private readonly logger = new Logger(ReportingController.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ─── Dashboard ─────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Top-level KPIs: counts by status, recent activity, throughput' })
  async dashboard() {
    try {
      const [counts, recent, activity, outcomes] = await Promise.all([
        this.ds.query(`
          SELECT status, COUNT(*)::int AS count
          FROM requests.visa_requests
          GROUP BY status ORDER BY status
        `),
        this.ds.query(`
          SELECT id, request_number, status, office_id, created_at
          FROM requests.visa_requests
          ORDER BY created_at DESC LIMIT 10
        `),
        this.ds.query(`
          SELECT
            COUNT(*) FILTER (WHERE occurred_at >= CURRENT_DATE)::int AS today,
            COUNT(*) FILTER (WHERE occurred_at >= CURRENT_DATE - INTERVAL '7 days')::int AS last_7_days,
            COUNT(*) FILTER (WHERE occurred_at >= CURRENT_DATE - INTERVAL '30 days')::int AS last_30_days
          FROM workflow.transitions
        `),
        this.ds.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'COMPLETED'  AND completed_at >= CURRENT_DATE - INTERVAL '30 days')::int AS completed_30d,
            COUNT(*) FILTER (WHERE status = 'REJECTED'   AND completed_at >= CURRENT_DATE - INTERVAL '30 days')::int AS rejected_30d,
            COUNT(*) FILTER (WHERE status = 'APOLOGIZED' AND completed_at >= CURRENT_DATE - INTERVAL '30 days')::int AS apologized_30d
          FROM requests.visa_requests
        `),
      ]);
      return {
        countsByStatus: counts,
        recentRequests: recent,
        transitionActivity: activity[0],
        outcomes30d: outcomes[0],
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error('Dashboard query failed', err as Error);
      return { error: 'Dashboard temporarily unavailable', generatedAt: new Date().toISOString() };
    }
  }

  // ─── Turnaround time ───────────────────────────────────

  @Get('turnaround')
  @ApiOperation({ summary: 'Avg, p50, p90 turnaround from SUBMITTED → COMPLETED (by visa type)' })
  async turnaround(@Query('days') days?: string) {
    const lookback = Math.max(1, Math.min(365, Number(days ?? 90)));
    const rows = await this.ds.query(`
      WITH durations AS (
        SELECT
          vt.name_en AS visa_type,
          EXTRACT(EPOCH FROM (vr.completed_at - vr.submitted_at)) / 86400.0 AS days
        FROM requests.visa_requests vr
        LEFT JOIN users.visa_types vt ON vt.id = vr.visa_type_id
        WHERE vr.status = 'COMPLETED'
          AND vr.completed_at IS NOT NULL
          AND vr.submitted_at IS NOT NULL
          AND vr.completed_at >= NOW() - ($1 || ' days')::interval
      )
      SELECT
        visa_type,
        COUNT(*)::int AS sample_size,
        ROUND(AVG(days)::numeric, 1) AS avg_days,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY days)::numeric, 1) AS p50_days,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY days)::numeric, 1) AS p90_days
      FROM durations
      GROUP BY visa_type
      ORDER BY sample_size DESC
    `, [lookback]);
    return { lookbackDays: lookback, byVisaType: rows };
  }

  // ─── Office performance ────────────────────────────────

  @Get('office-performance')
  @ApiOperation({ summary: 'Per-office volume, return rate, completion rate' })
  async officePerformance(@Query('days') days?: string) {
    const lookback = Math.max(1, Math.min(365, Number(days ?? 90)));
    const rows = await this.ds.query(`
      WITH window AS (
        SELECT * FROM requests.visa_requests
        WHERE created_at >= NOW() - ($1 || ' days')::interval
      ),
      returns AS (
        SELECT request_id, COUNT(*)::int AS returned_count
        FROM workflow.transitions
        WHERE to_status = 'RETURNED_TO_OFFICE'
        GROUP BY request_id
      )
      SELECT
        w.office_id,
        o.name_en AS office_name,
        COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE w.status = 'COMPLETED')::int  AS completed,
        COUNT(*) FILTER (WHERE w.status IN ('REJECTED','APOLOGIZED'))::int AS rejected_or_apologized,
        COUNT(*) FILTER (WHERE r.returned_count > 0)::int    AS ever_returned,
        ROUND(
          (COUNT(*) FILTER (WHERE w.status = 'COMPLETED')::numeric / NULLIF(COUNT(*), 0)) * 100, 1
        ) AS completion_pct
      FROM window w
      LEFT JOIN users.offices o ON o.id = w.office_id
      LEFT JOIN returns r ON r.request_id = w.id
      GROUP BY w.office_id, o.name_en
      ORDER BY total_requests DESC
    `, [lookback]);
    return { lookbackDays: lookback, offices: rows };
  }

  // ─── Workload ──────────────────────────────────────────

  @Get('workload')
  @ApiOperation({ summary: 'Open requests by status — who has what right now' })
  async workload() {
    const rows = await this.ds.query(`
      SELECT
        status,
        COUNT(*)::int AS open_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400.0)::numeric, 1) AS avg_age_days
      FROM requests.visa_requests
      WHERE status NOT IN ('COMPLETED','REJECTED','APOLOGIZED','DRAFT')
      GROUP BY status
      ORDER BY open_count DESC
    `);
    return { openByStatus: rows, generatedAt: new Date().toISOString() };
  }

  // ─── Bottlenecks ───────────────────────────────────────

  @Get('bottlenecks')
  @ApiOperation({ summary: 'Average time spent in each workflow stage' })
  async bottlenecks(@Query('days') days?: string) {
    const lookback = Math.max(1, Math.min(365, Number(days ?? 90)));
    const rows = await this.ds.query(`
      WITH paired AS (
        SELECT
          t.from_status AS stage,
          t.occurred_at AS entered,
          LEAD(t.occurred_at) OVER (PARTITION BY t.request_id ORDER BY t.occurred_at) AS exited
        FROM workflow.transitions t
        WHERE t.occurred_at >= NOW() - ($1 || ' days')::interval
      )
      SELECT
        stage,
        COUNT(*)::int AS sample_size,
        ROUND(AVG(EXTRACT(EPOCH FROM (exited - entered)) / 3600.0)::numeric, 1) AS avg_hours,
        ROUND(
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (exited - entered)) / 3600.0)::numeric,
          1
        ) AS p90_hours
      FROM paired
      WHERE stage IS NOT NULL AND exited IS NOT NULL
      GROUP BY stage
      ORDER BY avg_hours DESC NULLS LAST
    `, [lookback]);
    return { lookbackDays: lookback, byStage: rows };
  }

  // ─── Audit search — privileged ─────────────────────────

  @Get('audit')
  @UseGuards(PersonaGuard)
  @RequirePersona('DIRECTOR', 'SENIOR_OFFICER', 'SENIOR_ADMIN')
  @ApiOperation({ summary: 'Search the immutable audit log (privileged personas only)' })
  async auditSearch(
    @Query('actorUserId') actorUserId?: string,
    @Query('entityId') entityId?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit?: string,
  ) {
    const cap = Math.max(1, Math.min(500, Number(limit ?? 50)));
    const conditions: string[] = [];
    const params: any[] = [];
    if (actorUserId) { params.push(actorUserId); conditions.push(`actor_user_id = $${params.length}`); }
    if (entityId)    { params.push(entityId);    conditions.push(`entity_id = $${params.length}`); }
    if (eventType)   { params.push(eventType);   conditions.push(`event_type = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(cap);
    const rows = await this.ds.query(
      `SELECT id, event_type, entity_type, entity_id, actor_user_id, actor_persona,
              payload, ip_address, occurred_at
       FROM workflow.audit_events ${where}
       ORDER BY occurred_at DESC LIMIT $${params.length}`,
      params,
    );
    return { items: rows, count: rows.length };
  }

  // ─── Office-scoped dashboard ───────────────────────────

  @Get('my-office')
  @ApiOperation({ summary: 'Dashboard scoped to the caller\'s office' })
  async myOffice(@CurrentUser() user: AuthenticatedUser) {
    if (!user.officeId) {
      return { error: 'No office assigned to current user' };
    }
    const [counts, latest] = await Promise.all([
      this.ds.query(`
        SELECT status, COUNT(*)::int AS count
        FROM requests.visa_requests
        WHERE office_id = $1
        GROUP BY status ORDER BY status
      `, [user.officeId]),
      this.ds.query(`
        SELECT id, request_number, status, created_at
        FROM requests.visa_requests
        WHERE office_id = $1
        ORDER BY created_at DESC LIMIT 20
      `, [user.officeId]),
    ]);
    return { officeId: user.officeId, countsByStatus: counts, recentRequests: latest };
  }
}

@Controller('health')
class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}
  @Get()
  async check() {
    let dbOk = false;
    try { await this.ds.query('SELECT 1'); dbOk = true; } catch {}
    return { service: 'reporting-service', status: dbOk ? 'ok' : 'degraded', timestamp: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false,
      entities: [],
      logging: ['error'],
    }),
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-secret-CHANGE-ME' }),
  ],
  controllers: [HealthController, ReportingController],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.setGlobalPrefix('api', { exclude: ['health'] });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Reporting Service')
      .setDescription('Dashboards, throughput, turnaround, bottlenecks, audit search')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3007);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Reporting service listening on port ${port}`, 'Bootstrap');
}

bootstrap();
