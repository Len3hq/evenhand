import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { AppConfig } from '../../core/config.js';
import { DomainError } from '../../core/errors.js';
import { DUMMY_HASH_INPUT, hashPassword, verifyPassword } from '../../core/passwords.js';
import { PrismaService } from '../../core/prisma.service.js';
import { generateToken, hashToken } from '../../core/tokens.js';
import type { LoginDto, MeDto, RegisterDto } from './dto/auth.dto.js';

export interface NewSession {
  token: string;
  expiresAt: Date;
  me: MeDto;
}

@Injectable()
export class AuthService {
  /** Lazily computed hash used to equalise timing when the email is unknown. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async login(dto: LoginDto, ip: string | undefined): Promise<NewSession> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    this.dummyHash ??= hashPassword(DUMMY_HASH_INPUT);
    const passwordOk = await verifyPassword(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );

    if (!user || !passwordOk) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          actorId: user?.id ?? null,
          action: 'auth.login_failed',
          targetType: 'user',
          targetId: user?.id ?? null,
          after: { email: dto.email },
          ip,
        }),
      );
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'invalid_credentials',
        'Wrong email or password.',
      );
    }
    return this.startSession(user.id, 'auth.login', ip);
  }

  async register(dto: RegisterDto, ip: string | undefined): Promise<NewSession> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'email_taken',
        'An account with this email already exists.',
      );
    }
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash: await hashPassword(dto.password) },
    });
    return this.startSession(user.id, 'auth.registered', ip);
  }

  async logout(
    actor: Actor,
    sessionToken: string | undefined,
    ip: string | undefined,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (sessionToken) {
        await tx.session.deleteMany({
          where: { tokenHash: hashToken(sessionToken), userId: actor.userId },
        });
      }
      await this.audit.record(tx, {
        actorId: actor.userId,
        action: 'auth.logout',
        targetType: 'user',
        targetId: actor.userId,
        ip,
      });
    });
  }

  me(actor: Actor): MeDto {
    return {
      id: actor.userId,
      email: actor.email,
      name: actor.name,
      isAdmin: actor.isAdmin,
      roles: actor.grants.map((g) => ({
        eventId: g.eventId,
        role: g.role,
        externalId: g.externalId,
      })),
    };
  }

  private async startSession(
    userId: string,
    action: 'auth.login' | 'auth.registered',
    ip: string | undefined,
  ): Promise<NewSession> {
    const token = generateToken();
    const expiresAt = new Date(
      this.clock.now().getTime() + this.config.sessionTtlHours * 3_600_000,
    );
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
      await this.audit.record(tx, {
        actorId: userId,
        action,
        targetType: 'user',
        targetId: userId,
        ip,
      });
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { eventRoles: { select: { eventId: true, role: true, externalId: true } } },
      });
    });
    return {
      token,
      expiresAt,
      me: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        roles: user.eventRoles,
      },
    };
  }
}
