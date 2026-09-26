import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { SESSION_COOKIE } from './core/auth/session.guard.js';

export const API_PREFIX = 'api';

/**
 * Everything main.ts, the CLI and the e2e tests must share, so tests exercise exactly the
 * pipeline production runs. (Guards, the exception filter and the validation pipe are
 * registered as providers in CoreModule, so they apply automatically.)
 */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.disable('x-powered-by');
  // Every request reaches the api through the Next.js proxy (or another reverse proxy) on a
  // private network. Trusting private-range proxies makes req.ip the real client address
  // from X-Forwarded-For, which is what rate limiting keys on.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Evenhand API')
    .setDescription(
      'Every action the UI takes is available here. Authenticate with a bearer token ' +
        '(`Authorization: Bearer …`) or the `session` cookie set by POST /api/auth/login. ' +
        'Errors are always `{ statusCode, error, message }`.',
    )
    .setVersion('0.1.0')
    .setLicense('MIT', 'https://opensource.org/license/mit')
    .addBearerAuth()
    .addCookieAuth(SESSION_COOKIE)
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function mountOpenApi(app: INestApplication): void {
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => buildOpenApi(app), {
    jsonDocumentUrl: `${API_PREFIX}/openapi.json`,
  });
}
