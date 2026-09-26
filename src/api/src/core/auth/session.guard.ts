import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Clock } from '../clock.js';
import { AppConfig } from '../config.js';
import { DomainError, type ErrorCode } from '../errors.js';
import { PrismaService } from '../prisma.service.js';
import { hashToken } from '../tokens.js';
import type { Actor } from './actor.js';
import { ActorService } from './actor.service.js';
import { IS_PUBLIC } from './decorators.js';

export const SESSION_COOKIE = 'session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Refresh sessions.last_seen_at at most this often, to avoid a write per request. */
const LAST_SEEN_RESOLUTION_MS = 10 * 60 * 1000;

type AuthResult = { actor: Actor } | { failure: ErrorCode } | null;

/**
 * Global guard, runs on every request.
 *
 * 1. Resolves the caller from `Authorization: Bearer <token>` or the `session` cookie.
 * 2. Cookie-authenticated writes must come from an allowed Origin (CSRF defence).
 * 3. Non-public routes without a valid caller get 401 JSON. Never a redirect.
 *
 * On @Public() routes a bad or missing credential simply means "anonymous".
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly actors: ActorService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const result = await this.authenticate(req);
    if (result && 'actor' in result) {
      if (result.actor.via === 'session' && !SAFE_METHODS.has(req.method)) {
        this.assertAllowedOrigin(req);
      }
      req.actor = result.actor;
      return true;
    }
    if (isPublic) return true;
    throw new DomainError(
      HttpStatus.UNAUTHORIZED,
      result?.failure ?? 'unauthenticated',
      result?.failure === 'demo_token_disabled'
        ? 'Demo tokens only work when DEMO_MODE=true.'
        : 'Log in, or send a valid bearer token.',
    );
  }

  private async authenticate(req: Request): Promise<AuthResult> {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return this.fromBearer(header.slice('Bearer '.length).trim());
    }
    const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (cookie) {
      return this.fromSession(cookie);
    }
    return null;
  }

  private async fromBearer(token: string): Promise<AuthResult> {
    if (!token) return { failure: 'unauthenticated' };
    const row = await this.prisma.apiToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.revokedAt) return { failure: 'unauthenticated' };
    if (row.isDemo && !this.config.demoMode) return { failure: 'demo_token_disabled' };
    const actor = await this.actors.load(row.userId, 'bearer');
    return actor ? { actor } : { failure: 'unauthenticated' };
  }

  private async fromSession(token: string): Promise<AuthResult> {
    const now = this.clock.now();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!session || session.expiresAt <= now) return { failure: 'unauthenticated' };
    if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    const actor = await this.actors.load(session.userId, 'session');
    return actor ? { actor } : { failure: 'unauthenticated' };
  }

  /**
   * Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE. A cookie-authenticated
   * write without an allowed Origin (or Referer) is refused, so another site cannot ride on
   * a judge's session. Bearer tokens are not ambient credentials and skip this check.
   */
  private assertAllowedOrigin(req: Request): void {
    const origin = req.headers.origin ?? originOf(req.headers.referer);
    if (!origin || !this.config.allowedOrigins.includes(origin)) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'origin_not_allowed',
        'Cookie-authenticated writes must come from the portal itself.',
      );
    }
  }
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
