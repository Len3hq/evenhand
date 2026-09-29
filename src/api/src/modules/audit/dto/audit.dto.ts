import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../core/pagination.js';

export class AuditQueryDto extends PageQueryDto {
  /** An action (`event.updated`) or a group ending in a dot (`submission.`). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z_]+\.([a-z_]+)?$/, {
    message: 'action must look like "event.updated" or "event."',
  })
  action?: string;

  /** Only what this person did: their email or user id. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  actor?: string;

  /** Only entries about this row (e.g. a submission id). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  target?: string;
}

export class AuditActorDto {
  id: string;
  name: string;
  email: string;
}

export class AuditEntryDto {
  /** Increasing: a later entry always has a larger id. */
  id: string;
  at: string;
  action: string;
  /** Who did it; null for the system (seed, command line). */
  actor: AuditActorDto | null;
  targetType: string;
  targetId: string | null;
  /** The target's name or title, when it can be resolved (also for deleted rows). */
  target: string | null;
  /** One readable sentence, e.g. `Ben joined the team "Quiet Hours" with an invite link`. */
  summary: string;
  before: unknown;
  after: unknown;
}

export class AuditPageDto {
  items: AuditEntryDto[];
  page: number;
  pageSize: number;
  total: number;
}

/** Platform entries (logins, accounts, admin grants) also carry the client address. */
export class PlatformAuditEntryDto extends AuditEntryDto {
  ip: string | null;
}

export class PlatformAuditPageDto {
  items: PlatformAuditEntryDto[];
  page: number;
  pageSize: number;
  total: number;
}

/** The result of checking the audit log's hash chain (GET /api/audit/verify). */
export class AuditChainDto {
  /** True when every entry's hash matches its content, every link holds, and the chain ends at the recorded head. */
  intact: boolean;
  entries: number;
  /** Entries reached by walking the chain from the first one. Fewer than `entries` means a gap. */
  linked: number;
  /** The hash of the newest entry, as recorded by the database. Note it down to detect later truncation. */
  head: string;
  /** False when the walk ends somewhere other than the recorded head (newest entries removed). */
  headMatches: boolean;
  /** Ids of entries whose content no longer matches their hash (edited). Admins only; empty for organisers. */
  altered: string[];
  /** Ids of entries whose predecessor is missing (something before them was deleted). Admins only. */
  broken: string[];
  /** Counts of the two lists above, for everyone. */
  alteredCount: number;
  brokenCount: number;
  checkedAt: string;
}
