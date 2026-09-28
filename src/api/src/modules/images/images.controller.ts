import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import {
  CurrentActor,
  ImageRateLimit,
  OptionalActor,
  Public,
  UploadRateLimit,
} from '../../core/auth/decorators.js';
import { DomainError } from '../../core/errors.js';
import { ReorderImagesDto, SubmissionImageDto } from './dto/image.dto.js';
import { EditableSubmissionGuard } from './editable-submission.guard.js';
import { type ImageSize, ImagesService, type UploadedImage } from './images.service.js';
import { IMAGE_RULES } from './process-image.js';

const SUBMISSION = { name: 'ref', description: 'Submission id or fixture id (prj_01).' };

@ApiTags('images')
@Controller()
export class ImagesController {
  private readonly logger = new Logger(ImagesController.name);

  constructor(private readonly images: ImagesService) {}

  /**
   * Add an image to your team's submission (multipart, one file in the field "file", at most
   * 8 MB). JPEG, PNG or WebP, at most 40 megapixels; it is re-encoded to WebP with its metadata
   * removed. At most 6 per project; the first is the cover. Team members only, until the
   * deadline: both are checked before the upload is read.
   */
  @ApiParam(SUBMISSION)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @Post('submissions/:ref/images')
  @UploadRateLimit()
  @UseGuards(EditableSubmissionGuard)
  @UseInterceptors(
    // No storage option: the upload is kept in memory, capped, and never written as received.
    FileInterceptor('file', {
      limits: { fileSize: IMAGE_RULES.maxBytes, files: 1, fields: 0, parts: 1 },
    }),
  )
  add(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<SubmissionImageDto[]> {
    return this.images.add(actor, req.submission!, file);
  }

  /** Remove one of your team's images. Team members only, until the deadline. */
  @ApiParam(SUBMISSION)
  @Delete('submissions/:ref/images/:imageId')
  @UseGuards(EditableSubmissionGuard)
  remove(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Param('imageId') imageId: string,
  ): Promise<SubmissionImageDto[]> {
    return this.images.remove(actor, req.submission!, imageId);
  }

  /** Put your team's images in a new order; the first becomes the cover. */
  @ApiParam(SUBMISSION)
  @Put('submissions/:ref/images/order')
  @UseGuards(EditableSubmissionGuard)
  reorder(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Body() dto: ReorderImagesDto,
  ): Promise<SubmissionImageDto[]> {
    return this.images.reorder(actor, req.submission!, dto.order);
  }

  /**
   * An image (WebP). Public when its project is in the gallery; otherwise for the project's
   * team, the event's organisers and its assigned judges (401 / 403 for anyone else).
   */
  @Public()
  @ImageRateLimit()
  @ApiProduces('image/webp')
  @Get('images/:id')
  full(
    @OptionalActor() actor: Actor | undefined,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.send(actor, id, 'full', res);
  }

  /** The image's 640 × 400 thumbnail (WebP), with the same visibility as the image. */
  @Public()
  @ImageRateLimit()
  @ApiProduces('image/webp')
  @Get('images/:id/thumb')
  thumb(
    @OptionalActor() actor: Actor | undefined,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.send(actor, id, 'thumb', res);
  }

  private async send(
    actor: Actor | undefined,
    id: string,
    size: ImageSize,
    res: Response,
  ): Promise<StreamableFile> {
    const { path, isPublic } = await this.images.file(actor, id, size);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      this.logger.warn(`image ${id} (${size}) is in the database but not in UPLOADS_DIR`);
      throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such image.');
    }
    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(info.size),
      // Public images may be cached briefly (a project can leave the gallery); others never.
      'Cache-Control': isPublic ? 'public, max-age=300' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Opened directly, it is an image and nothing else: no script, no plugin, no framing.
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Disposition': `inline; filename="${id}${size === 'thumb' ? '-thumb' : ''}.webp"`,
    });
    return new StreamableFile(createReadStream(path));
  }
}
