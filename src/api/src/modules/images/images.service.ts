import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { AppConfig } from '../../core/config.js';
import { assertSubmissionsOpen } from '../../core/deadline.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { isUuid } from '../../core/refs.js';
import type { Event, Submission } from '../../generated/prisma/client.js';
import { PUBLIC_SUBMISSION } from '../gallery/gallery.service.js';
import { coveredBy } from '../judging/in-judging.js';
import type { SubmissionImageDto } from './dto/image.dto.js';
import { IMAGE_ORDER, imageUrl, toImageDto } from './image-dto.js';
import { IMAGE_RULES, processImage } from './process-image.js';

export type ImageSize = 'full' | 'thumb';
type EditableSubmission = Submission & { event: Event };

/** The uploaded file as the upload interceptor hands it over (kept in memory, size-capped). */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

/**
 * A submission's images: upload, remove, reorder, and serving them to whoever may see them.
 * Writes follow the portal's order: permission and deadline (EditableSubmissionGuard, before the
 * upload is read), the rules, then the row and its audit entry in one transaction. Files are
 * written before the transaction and removed again if it fails; a removed image's files go
 * after it commits, so a failed write never loses one.
 */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async add(
    actor: Actor,
    submission: EditableSubmission,
    file: UploadedImage | undefined,
  ): Promise<SubmissionImageDto[]> {
    if (!file?.buffer?.length) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Attach one image as the "file" field of a multipart form.',
      );
    }
    const image = await processImage(file.buffer);
    const id = randomUUID();
    await this.store(id, image.full, image.thumb);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockSubmission(tx, submission.id);
        // The upload may have taken a moment: the deadline is checked again at the write.
        assertSubmissionsOpen(submission.event, this.clock.now());
        const existing = await tx.submissionImage.findMany({
          where: { submissionId: submission.id },
          orderBy: IMAGE_ORDER,
        });
        if (existing.length >= IMAGE_RULES.maxPerSubmission) {
          throw new DomainError(
            HttpStatus.CONFLICT,
            'too_many_images',
            `A project has at most ${IMAGE_RULES.maxPerSubmission} images; remove one first.`,
          );
        }
        await tx.submissionImage.create({
          data: {
            id,
            submissionId: submission.id,
            url: imageUrl(id),
            order: existing.length,
            width: image.width,
            height: image.height,
          },
        });
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: submission.eventId,
          action: 'submission.image_added',
          targetType: 'submission',
          targetId: submission.id,
          after: {
            image: id,
            width: image.width,
            height: image.height,
            bytes: image.full.length,
            receivedBytes: file.size,
          },
        });
        return this.list(tx, submission.id);
      });
    } catch (e) {
      await this.discard(id);
      throw e;
    }
  }

  async remove(
    actor: Actor,
    submission: EditableSubmission,
    imageId: string,
  ): Promise<SubmissionImageDto[]> {
    const result = await this.prisma.$transaction(async (tx) => {
      await lockSubmission(tx, submission.id);
      const images = await tx.submissionImage.findMany({
        where: { submissionId: submission.id },
        orderBy: IMAGE_ORDER,
      });
      const gone = images.find((i) => i.id === imageId);
      if (!gone) throw noSuchImage();
      await tx.submissionImage.delete({ where: { id: gone.id } });
      const kept = images.filter((i) => i.id !== gone.id);
      await renumber(
        tx,
        kept.map((i) => i.id),
      );
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: submission.eventId,
        action: 'submission.image_removed',
        targetType: 'submission',
        targetId: submission.id,
        before: { image: gone.id, order: gone.order },
      });
      return this.list(tx, submission.id);
    });
    await this.discard(imageId);
    return result;
  }

  /** `order` must name every image of the submission exactly once; the first is the cover. */
  async reorder(
    actor: Actor,
    submission: EditableSubmission,
    order: string[],
  ): Promise<SubmissionImageDto[]> {
    return this.prisma.$transaction(async (tx) => {
      await lockSubmission(tx, submission.id);
      const images = await tx.submissionImage.findMany({
        where: { submissionId: submission.id },
        orderBy: IMAGE_ORDER,
      });
      const before = images.map((i) => i.id);
      const same =
        order.length === before.length &&
        new Set(order).size === order.length &&
        order.every((id) => before.includes(id));
      if (!same) {
        throw new DomainError(
          HttpStatus.BAD_REQUEST,
          'validation_failed',
          "List every one of this project's images exactly once.",
        );
      }
      if (order.some((id, i) => id !== before[i])) {
        await renumber(tx, order);
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: submission.eventId,
          action: 'submission.images_reordered',
          targetType: 'submission',
          targetId: submission.id,
          before: { order: before },
          after: { order },
        });
      }
      return this.list(tx, submission.id);
    });
  }

  /**
   * The file to send for GET /images/:id[/thumb], and whether it may be cached publicly.
   * An image is public exactly when its project is in the public gallery. Otherwise it is
   * for the project's team, the event's organisers and admins, and judges assigned to it who
   * still cover its track:
   * 401 for a visitor, 403 for anyone else logged in. The answer depends on the project, so
   * it is looked up first; ids are random UUIDs, and a missing one is 404.
   */
  async file(
    actor: Actor | undefined,
    id: string,
    size: ImageSize,
  ): Promise<{ path: string; isPublic: boolean }> {
    const image = isUuid(id)
      ? await this.prisma.submissionImage.findUnique({
          where: { id },
          select: {
            id: true,
            submission: { select: { id: true, eventId: true, teamId: true } },
          },
        })
      : null;
    if (!image) throw noSuchImage();
    const s = image.submission;
    const path = this.pathOf(image.id, size);

    const isPublic =
      (await this.prisma.submission.count({ where: { id: s.id, ...PUBLIC_SUBMISSION } })) > 0;
    if (isPublic) return { path, isPublic };
    if (!actor) {
      throw new DomainError(
        HttpStatus.UNAUTHORIZED,
        'unauthenticated',
        'Log in to see this image.',
      );
    }
    if (actor.canManageEvent(s.eventId)) return { path, isPublic };
    const [member, judge] = await Promise.all([
      this.prisma.teamMember.count({ where: { teamId: s.teamId, userId: actor.userId } }),
      // An assigned judge, and only while they still cover the project's track.
      this.prisma.assignment.count({
        where: {
          submissionId: s.id,
          judgeRole: { userId: actor.userId, role: 'JUDGE' },
          submission: coveredBy(actor.userId),
        },
      }),
    ]);
    if (member || judge) return { path, isPublic };
    throw forbidden('This image belongs to a project that is not public.');
  }

  private list(tx: Tx, submissionId: string): Promise<SubmissionImageDto[]> {
    return tx.submissionImage
      .findMany({ where: { submissionId }, orderBy: IMAGE_ORDER })
      .then((rows) => rows.map(toImageDto));
  }

  /** Server-made names only (a UUID we generated), so no path from the request reaches disk. */
  private pathOf(id: string, size: ImageSize): string {
    return join(this.config.uploadsDir, size === 'full' ? `${id}.webp` : `${id}-thumb.webp`);
  }

  /** Writes both files; each appears under its final name only when complete. */
  private async store(id: string, full: Buffer, thumb: Buffer): Promise<void> {
    await mkdir(this.config.uploadsDir, { recursive: true });
    for (const [size, data] of [
      ['full', full],
      ['thumb', thumb],
    ] as const) {
      const target = this.pathOf(id, size);
      await writeFile(`${target}.part`, data, { flag: 'wx' });
      await rename(`${target}.part`, target);
    }
  }

  private async discard(id: string): Promise<void> {
    for (const size of ['full', 'thumb'] as const) {
      for (const path of [this.pathOf(id, size), `${this.pathOf(id, size)}.part`]) {
        await unlink(path).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== 'ENOENT') this.logger.warn(`could not remove ${path}: ${e.message}`);
        });
      }
    }
  }
}

/** Serialises image writes to one submission, so two uploads cannot both take the last slot. */
async function lockSubmission(tx: Tx, submissionId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "submissions" WHERE "id" = ${submissionId}::uuid FOR UPDATE`;
}

async function renumber(tx: Tx, ids: readonly string[]): Promise<void> {
  for (const [order, id] of ids.entries()) {
    await tx.submissionImage.update({ where: { id }, data: { order } });
  }
}

const noSuchImage = (): DomainError =>
  new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such image.');
