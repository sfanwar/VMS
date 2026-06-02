/**
 * Visa Management System — API Gateway
 *
 * Responsibilities:
 *   1. Single public ingress for the frontend
 *   2. CORS allowlist (frontend origin only)
 *   3. JWT verification on protected routes
 *   4. Per-IP rate limiting
 *   5. Reverse-proxy to internal services
 *
 * Internal endpoints (containing "/internal/") are explicitly blocked here —
 * they are reachable only over the docker network from sibling services.
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createProxyMiddleware } from 'http-proxy-middleware';

const PORT = Number(process.env.PORT ?? 3000);
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-CHANGE-ME';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

const SERVICES = {
  '/api/auth':           process.env.AUTH_SERVICE_URL          ?? 'http://auth-service:3001',
  '/api/users':          process.env.USER_SERVICE_URL          ?? 'http://user-service:3002',
  '/api/offices':        process.env.USER_SERVICE_URL          ?? 'http://user-service:3002',
  '/api/personas':       process.env.USER_SERVICE_URL          ?? 'http://user-service:3002',
  '/api/reference':      process.env.USER_SERVICE_URL          ?? 'http://user-service:3002',
  '/api/requests':       process.env.REQUEST_SERVICE_URL       ?? 'http://request-service:3003',
  '/api/workflow':       process.env.WORKFLOW_SERVICE_URL      ?? 'http://workflow-service:3004',
  '/api/documents':      process.env.DOCUMENT_SERVICE_URL      ?? 'http://document-service:3005',
  '/api/notifications':  process.env.NOTIFICATION_SERVICE_URL  ?? 'http://notification-service:3006',
  '/api/reporting':      process.env.REPORTING_SERVICE_URL     ?? 'http://reporting-service:3007',
};

// Endpoints that DON'T require a JWT
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/health',
];

const app = express();

// Security headers
app.use(helmet());

// CORS — strict allowlist
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
}));

// Rate limit — 100 req/min/IP
// `limit` is the canonical option in express-rate-limit v7+/v8 (replaces the
// deprecated `max`).
app.use(rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errorCode: 'RATE_LIMITED', message: 'Too many requests' },
}));

// Block internal endpoints at the perimeter
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.includes('/internal/')) {
    res.status(404).json({ statusCode: 404, errorCode: 'NOT_FOUND', message: 'Not found' });
    return;
  }
  next();
});

// JWT verification for protected paths
app.use((req: Request, res: Response, next: NextFunction) => {
  if (PUBLIC_PATHS.some((p) => req.path.startsWith(p)) || req.path === '/') {
    return next();
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ statusCode: 401, errorCode: 'MISSING_TOKEN', message: 'Bearer token required' });
  }
  try {
    // Pin the algorithm: without this, the verifier would accept any algorithm
    // the token claims (the classic JWT "alg confusion" / "alg:none" attack).
    jwt.verify(auth.slice('Bearer '.length), JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    res.status(401).json({ statusCode: 401, errorCode: 'INVALID_TOKEN', message: 'JWT invalid or expired' });
  }
});

// Health
app.get('/health', (_req, res) => {
  res.json({ service: 'api-gateway', status: 'ok', upstreams: Object.keys(SERVICES), timestamp: new Date().toISOString() });
});

// Proxy routes
for (const [prefix, target] of Object.entries(SERVICES)) {
  app.use(prefix, createProxyMiddleware({
    target,
    changeOrigin: true,
    // Path is forwarded as-is — each backend already mounts at /api/<...>
    onProxyReq: (_proxyReq: any, req: any) => {
      // Forward client IP so backend audit logs see the real source
      req.headers['x-forwarded-for'] = (req as Request).ip;
    },
    onError: (err: Error, _req: any, res: any) => {
      // eslint-disable-next-line no-console
      console.error(`Proxy error → ${target}:`, err.message);
      (res as Response).status(502).json({
        statusCode: 502, errorCode: 'UPSTREAM_UNAVAILABLE',
        message: `Service at ${prefix} is unavailable`,
      });
    },
  } as any));
}

app.use((_req: Request, res: Response) => {
  res.status(404).json({ statusCode: 404, errorCode: 'NOT_FOUND', message: 'Route not found' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API Gateway listening on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});
