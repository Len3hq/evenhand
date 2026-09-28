import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../core/errors.js';
import { pageArgs } from '../../core/pagination.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef, eventByRef } from '../../core/refs.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  GalleryQueryDto,
  ProjectDetailDto,
  ProjectPageDto,
  ProjectSummaryDto,
} from './dto/gallery.dto.js';

/**
 * What the public may see: submitted, eligible, and not superseded by a merged duplicate.
 * Both copies of a *pending* duplicate stay visible until the organiser decides
 * (BUILD-PLAN decision 5). Drafts and disqualified projects never appear.
 */
const PUBLIC_SUBMISSION: Prisma.SubmissionWhereInput = {
  status: 'SUBMITTED',
  eligibility: 'ELIGIBLE',
  supersededById: null,
};

const SUMMARY_INCLUDE = {
  track: { select: { id: true, externalId: true, name: true } },
  team: { select: { name: true } },
} satisfies Prisma.SubmissionInclude;

type SubmissionWithSummary = Prisma.SubmissionGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

/**
 * The public gallery. This is the reference ("golden slice") module: controller → service →
 * Prisma → DTO, with an e2e test in tests/api. New modules copy its shape.
 */
@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: GalleryQueryDto): Promise<ProjectPageDto> {
    const where: Prisma.SubmissionWhereInput = {
      ...PUBLIC_SUBMISSION,
      ...(query.event ? { event: eventByRef(query.event) } : {}),
      ...(query.track ? { track: byRef(query.track) } : {}),
      ...(query.tag ? { techTags: { has: query.tag } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { tagline: { contains: query.q, mode: 'insensitive' } },
              { summary: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.submission.findMany({
        where,
        include: SUMMARY_INCLUDE,
        // Fixture order first, so page 1 always holds the first fixture projects
        // (acceptance check 2); then submission time; id breaks any remaining tie.
        orderBy: [
          { seedOrder: { sort: 'asc', nulls: 'last' } },
          { submittedAt: 'asc' },
          { id: 'asc' },
        ],
        ...pageArgs(query),
      }),
      this.prisma.submission.count({ where }),
    ]);
    return { items: rows.map(toSummary), page: query.page, pageSize: query.pageSize, total };
  }

  async get(ref: string): Promise<ProjectDetailDto> {
    const row = await this.prisma.submission.findFirst({
      where: { ...PUBLIC_SUBMISSION, ...byRef(ref) },
      include: {
        ...SUMMARY_INCLUDE,
        images: { orderBy: { order: 'asc' } },
        answers: {
          where: { question: { isPublic: true } },
          include: { question: { select: { prompt: true } } },
          orderBy: [{ question: { order: 'asc' } }, { questionId: 'asc' }],
        },
      },
    });
    if (!row) {
      throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such project.');
    }
    return {
      ...toSummary(row),
      description: row.description,
      repoUrl: row.repoUrl,
      demoVideoUrl: row.demoVideoUrl,
      liveUrl: row.liveUrl,
      imageUrls: row.images.map((i) => i.url),
      answers: row.answers.map((a) => ({ prompt: a.question.prompt, value: a.value })),
    };
  }
}

function toSummary(row: SubmissionWithSummary): ProjectSummaryDto {
  return {
    id: row.id,
    externalId: row.externalId,
    eventId: row.eventId,
    title: row.title,
    tagline: row.tagline,
    summary: row.summary,
    thumbnailUrl: row.thumbnailUrl,
    techTags: row.techTags,
    track: row.track,
    teamName: row.team.name,
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}
