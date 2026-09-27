import { Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { type CsvCell, toCsv } from '../../core/csv.js';
import { forbidden } from '../../core/errors.js';
import { type Page, pageArgs } from '../../core/pagination.js';
import { PrismaService } from '../../core/prisma.service.js';
import { isUuid } from '../../core/refs.js';
import type { AuditLog, Prisma } from '../../generated/prisma/client.js';
import { manageableEvent } from '../events/manageable-event.js';
import type { AuditEntryDto, AuditQueryDto, PlatformAuditEntryDto } from './dto/audit.dto.js';
import { summarise } from './summarise.js';

type Row = AuditLog & { actor: { id: string; name: string; email: string } | null };

/** Every entry of an event for the CSV export: generous, but bounded. */
const CSV_LIMIT = 50_000;

/**
 * Reads the append-only audit log for people, not for the database: every entry comes back
 * with the actor's name, the target's name and one readable sentence.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** One event's trail. Its organisers and admins only (403 before any lookup for others). */
  async forEvent(actor: Actor, eventRef: string, q: AuditQueryDto): Promise<Page<AuditEntryDto>> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const where = await this.where({ eventId: event.id }, q);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { id: 'desc' },
        ...pageArgs(q),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const items = await this.present(rows);
    return { items, page: q.page, pageSize: q.pageSize, total };
  }

  /** The same trail, oldest first, as CSV. */
  async eventCsv(actor: Actor, eventRef: string): Promise<{ filename: string; csv: string }> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const rows = await this.prisma.auditLog.findMany({
      where: { eventId: event.id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { id: 'asc' },
      take: CSV_LIMIT,
    });
    const entries = await this.present(rows);
    const header = [
      'id',
      'at',
      'actor_email',
      'actor_name',
      'action',
      'target_type',
      'target_id',
      'target',
      'summary',
      'before',
      'after',
    ];
    const cells = entries.map((e): CsvCell[] => [
      e.id,
      e.at,
      e.actor?.email ?? '',
      e.actor?.name ?? '',
      e.action,
      e.targetType,
      e.targetId ?? '',
      e.target ?? '',
      e.summary,
      json(e.before),
      json(e.after),
    ]);
    return { filename: `${event.slug}-audit.csv`, csv: toCsv(header, cells) };
  }

  /** Entries that belong to no event: logins, accounts, admin grants. Admins only. */
  async platform(actor: Actor, q: AuditQueryDto): Promise<Page<PlatformAuditEntryDto>> {
    if (!actor.isAdmin) throw forbidden();
    const where = await this.where({ eventId: null }, q);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { id: 'desc' },
        ...pageArgs(q),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const presented = await this.present(rows);
    const items = presented.map((e, i) => ({ ...e, ip: rows[i]!.ip }));
    return { items, page: q.page, pageSize: q.pageSize, total };
  }

  private async where(
    base: Prisma.AuditLogWhereInput,
    q: AuditQueryDto,
  ): Promise<Prisma.AuditLogWhereInput> {
    const where: Prisma.AuditLogWhereInput = { ...base };
    if (q.action) {
      where.action = q.action.endsWith('.') ? { startsWith: q.action } : q.action;
    }
    if (q.target) where.targetId = q.target;
    if (q.actor) {
      // An unknown person simply matches nothing, like any other filter.
      const user = await this.prisma.user.findFirst({
        where: isUuid(q.actor) ? { id: q.actor } : { email: q.actor.trim().toLowerCase() },
        select: { id: true },
      });
      where.actorId = user?.id ?? '00000000-0000-0000-0000-000000000000';
    }
    return where;
  }

  /** Rows → entries, resolving every target name with one query per target type. */
  private async present(rows: Row[]): Promise<AuditEntryDto[]> {
    const labels = await this.labels(rows);
    return rows.map((r) => {
      const target =
        (r.targetId && labels.get(`${r.targetType}:${r.targetId}`)) ?? labelFromRow(r) ?? null;
      return {
        id: r.id.toString(),
        at: r.at.toISOString(),
        action: r.action,
        actor: r.actor,
        targetType: r.targetType,
        targetId: r.targetId,
        target,
        summary: summarise(r, r.actor?.name ?? null, target),
        before: r.before,
        after: r.after,
      };
    });
  }

  private async labels(rows: Row[]): Promise<Map<string, string>> {
    const idsOf = (type: string): string[] => [
      ...new Set(
        rows
          .filter((r) => r.targetType === type && r.targetId && isUuid(r.targetId))
          .map((r) => r.targetId!),
      ),
    ];
    const inIds = (type: string) => ({ where: { id: { in: idsOf(type) } } });
    const [events, tracks, prizes, teams, submissions, users] = await Promise.all([
      this.prisma.event.findMany({ ...inIds('event'), select: { id: true, name: true } }),
      this.prisma.track.findMany({ ...inIds('track'), select: { id: true, name: true } }),
      this.prisma.prize.findMany({ ...inIds('prize'), select: { id: true, name: true } }),
      this.prisma.team.findMany({ ...inIds('team'), select: { id: true, name: true } }),
      this.prisma.submission.findMany({
        ...inIds('submission'),
        select: { id: true, title: true },
      }),
      this.prisma.user.findMany({ ...inIds('user'), select: { id: true, email: true } }),
    ]);
    const map = new Map<string, string>();
    for (const e of events) map.set(`event:${e.id}`, e.name);
    for (const t of tracks) map.set(`track:${t.id}`, t.name);
    for (const p of prizes) map.set(`prize:${p.id}`, p.name);
    for (const t of teams) map.set(`team:${t.id}`, t.name);
    for (const s of submissions) map.set(`submission:${s.id}`, s.title);
    for (const u of users) map.set(`user:${u.id}`, u.email);
    return map;
  }
}

/** A deleted row's name, from the snapshot the audit entry kept of it. */
function labelFromRow(r: Row): string | null {
  for (const snapshot of [r.before, r.after]) {
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      const s = snapshot as Record<string, unknown>;
      const name = s.name ?? s.title;
      if (typeof name === 'string') return name;
    }
  }
  return null;
}

const json = (v: unknown): string => (v === null || v === undefined ? '' : JSON.stringify(v));
