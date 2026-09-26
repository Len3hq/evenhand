import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuditAction } from './audit-actions.js';
import type { Tx } from './prisma.service.js';

export interface AuditEntry {
  actorId?: string | null;
  eventId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/**
 * Writes the append-only audit log. Always pass the transaction client of the change being
 * described, so the change and its audit row commit (or roll back) together.
 */
@Injectable()
export class AuditService {
  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        eventId: entry.eventId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: entry.ip ?? null,
      },
    });
  }
}

/** Dates and other non-JSON values become plain JSON; undefined becomes SQL NULL. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
