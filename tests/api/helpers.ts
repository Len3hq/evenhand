import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/api/src/app.module.js';
import { configureApp } from '../../src/api/src/app.setup.js';
import { Clock } from '../../src/api/src/core/clock.js';
import { AppConfig } from '../../src/api/src/core/config.js';
import { PrismaService } from '../../src/api/src/core/prisma.service.js';
import { hashToken } from '../../src/api/src/core/tokens.js';

/** The fixed demo tokens (same values as .dogfood.toml). */
export const TOKENS = {
  organizer: 'dev-organizer-7f2a',
  judge_a: 'dev-judge-a-91bc',
  judge_b: 'dev-judge-b-44de',
  participant: 'dev-participant-2e88',
} as const;

export const bearer = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/**
 * The real AppModule with the same configureApp() as production. Pass `clock` to freeze time
 * or `config` overrides to test other settings (demo mode off, tight rate limits…).
 */
export async function createTestApp(
  opts: { clock?: Clock; config?: Partial<AppConfig> } = {},
): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.clock) builder = builder.overrideProvider(Clock).useValue(opts.clock);
  if (opts.config) {
    const config = Object.assign(
      Object.create(AppConfig.prototype) as AppConfig,
      AppConfig.fromEnv(),
      opts.config,
    );
    builder = builder.overrideProvider(AppConfig).useValue(config);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  // Listen once on 127.0.0.1 explicitly. Handing supertest the bare server makes it listen on
  // a fresh port per request on every interface, then connect to 127.0.0.1; on macOS another
  // process can hold that port number on 127.0.0.1 alone, and the request lands there instead
  // (random 404s and 400s from a stranger).
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as { port: number };
  const base = `http://127.0.0.1:${port}`;
  return {
    app,
    prisma: app.get(PrismaService),
    http: () => request(base),
    close: () => app.close(),
  };
}

/** Creates (once) a non-demo bearer token for a user, e.g. the admin, and returns it. */
export async function tokenFor(
  prisma: PrismaService,
  email: string,
  label: string,
): Promise<string> {
  const token = `test-${label}`;
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.apiToken.upsert({
    where: { tokenHash: hashToken(token) },
    create: { userId: user.id, tokenHash: hashToken(token), label },
    update: {},
  });
  return token;
}
