import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../../core/pagination.js';
import { SLUG_PATTERN } from '../slug.js';

/**
 * Deadlines are UTC instants (BUILD-PLAN decision 48). A timestamp without an offset would be
 * read in the server's local zone, so every date must say which zone it is in.
 */
const ISO_WITH_ZONE = /(Z|[+-]\d{2}:\d{2})$/;
const ZONE_MESSAGE = '$property must include a time zone, e.g. 2026-10-01T18:00:00Z';

export class CreateEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  /** URL name, e.g. `spring-hack-2026`. Derived from the name when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(SLUG_PATTERN, { message: 'slug must be lower-case words joined by hyphens' })
  slug?: string;

  /** When submissions open. Optional: without it, submissions are open until the close. */
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_ZONE, { message: ZONE_MESSAGE })
  opensAt?: string;

  /** Submissions are accepted only while now < submissionsClose (server clock, UTC). */
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_ZONE, { message: ZONE_MESSAGE })
  submissionsClose: string;

  /** When judging ends. Must be after submissionsClose. */
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_ZONE, { message: ZONE_MESSAGE })
  judgingClose?: string;
}

/**
 * Every field optional; send only what changes. `null` clears an optional date. The slug is
 * fixed once created, so links to the event keep working.
 */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_ZONE, { message: ZONE_MESSAGE })
  opensAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_ZONE, { message: ZONE_MESSAGE })
  submissionsClose?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(ISO_WITH_ZONE, { message: ZONE_MESSAGE })
  judgingClose?: string | null;
}

export class EventQueryDto extends PageQueryDto {}

export class EventDto {
  id: string;
  /** Fixture id (e.g. evt_01) when imported from fixtures.json. */
  externalId: string | null;
  slug: string;
  name: string;
  opensAt: string | null;
  submissionsClose: string;
  judgingClose: string | null;
  resultsPublishedAt: string | null;
  /** True while the server accepts submissions: opensAt <= now < submissionsClose. */
  submissionsOpen: boolean;
}

export class EventPageDto {
  items: EventDto[];
  page: number;
  pageSize: number;
  total: number;
}

export class EventTrackDto {
  id: string;
  externalId: string | null;
  name: string;
}

export class EventPrizeDto {
  id: string;
  name: string;
  description: string | null;
  /** Null for an overall prize. */
  trackId: string | null;
}

export class EventDetailDto extends EventDto {
  tracks: EventTrackDto[];
  prizes: EventPrizeDto[];
}
