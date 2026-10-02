import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { toNodeHandler } from 'better-auth/node';
import type { Express, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AUTH } from './auth/auth.tokens';
import type { AuthInstance } from './auth/auth';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadEnv } from './config/env';

const PUBLIC_API_TAGS = new Set(['records', 'metadata', 'activities', 'search', 'files', 'views']);

let sentryInitialized = false;

function initSentry(dsn: string | undefined, environment: string): void {
  if (!dsn || sentryInitialized) {
    return;
  }
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
  });
  sentryInitialized = true;
}

/**
 * The API only serves JSON, so its CSP forbids everything. Swagger UI under /docs needs
 * inline scripts and styles, so it gets the other helmet defaults without a CSP.
 */
function securityHeaders(): RequestHandler {
  const api = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  const docs = helmet({ contentSecurityPolicy: false });
  return (req, res, next) =>
    req.path.startsWith('/docs') ? docs(req, res, next) : api(req, res, next);
}

export async function createApp(): Promise<INestApplication> {
  const env = loadEnv();
  initSentry(env.SENTRY_DSN, env.NODE_ENV);
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  app.useGlobalFilters(new AllExceptionsFilter());

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.disable('x-powered-by');
  if (env.TRUST_PROXY > 0) {
    expressApp.set('trust proxy', env.TRUST_PROXY);
  }
  expressApp.use(securityHeaders());
  const { json, urlencoded } = await import('express');
  const auth = app.get<AuthInstance>(AUTH);
  const authHandler = toNodeHandler(auth);

  expressApp.all('/api/auth/*splat', (req: Request, res: Response) => {
    void authHandler(req, res);
  });

  const { raw } = await import('express');
  // Stripe webhooks need the unmodified body for signature verification.
  expressApp.use(
    '/billing/webhooks/stripe',
    raw({ type: 'application/json' }),
    (req: Request & { rawBody?: Buffer }, _res, next) => {
      if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body;
      }
      next();
    },
  );

  // 12mb accommodates base64-encoded file uploads up to MAX_FILE_SIZE_BYTES (8mb raw, ~1.34x on the wire).
  expressApp.use(json({ limit: '12mb' }));
  expressApp.use(urlencoded({ extended: true }));

  const config = new DocumentBuilder()
    .setTitle('Cragfoge CRM')
    .setDescription('HTTP API for the Cragfoge CRM.')
    .setVersion('0.0.1')
    .addCookieAuth('better-auth.session_token')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'API Key' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const publicConfig = new DocumentBuilder()
    .setTitle('Cragfoge CRM Public API')
    .setDescription(
      'Public REST API authenticated with workspace API keys (`Authorization: Bearer <key>`).',
    )
    .setVersion('0.0.1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'API Key' }, 'api-key')
    .addApiKey({ type: 'apiKey', name: 'X-Workspace-Id', in: 'header' }, 'workspace')
    .build();
  const publicDocument = SwaggerModule.createDocument(app, publicConfig);
  publicDocument.paths = Object.fromEntries(
    Object.entries(publicDocument.paths).filter(([, pathItem]) => {
      if (!pathItem) return false;
      const operations = Object.values(pathItem).filter(
        (value): value is { tags?: string[] } => typeof value === 'object' && value !== null,
      );
      return operations.some((operation) =>
        (operation.tags ?? []).some((tag) => PUBLIC_API_TAGS.has(tag)),
      );
    }),
  );
  publicDocument.tags = (publicDocument.tags ?? []).filter((tag) => PUBLIC_API_TAGS.has(tag.name));
  SwaggerModule.setup('docs/public', app, publicDocument);

  return app;
}
