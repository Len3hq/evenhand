import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import {
  CommentRateLimit,
  CurrentActor,
  OptionalActor,
  Public,
} from '../../core/auth/decorators.js';
import { CommentDto, HideCommentDto, PostCommentDto } from './dto/comment.dto.js';
import { CommentsService } from './comments.service.js';

const PROJECT = { name: 'ref', description: 'Project id or fixture id (prj_01).' };

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /**
   * A public project's comments, oldest first. Visitors see visible comments only; the event's
   * organisers also see hidden ones, marked, with the reason. 404 for a project not in the gallery.
   */
  @Public()
  @ApiParam(PROJECT)
  @Get('projects/:ref/comments')
  list(
    @OptionalActor() actor: Actor | undefined,
    @Param('ref') ref: string,
  ): Promise<CommentDto[]> {
    return this.comments.list(actor, ref);
  }

  /** Comment on a public project. Anyone logged in; rate limited per address; audited. */
  @ApiParam(PROJECT)
  @CommentRateLimit()
  @Post('projects/:ref/comments')
  post(
    @CurrentActor() actor: Actor,
    @Param('ref') ref: string,
    @Body() dto: PostCommentDto,
  ): Promise<CommentDto> {
    return this.comments.post(actor, ref, dto.body);
  }

  /** Hide a comment, with a reason. The event's organisers and admins; reversible. */
  @Post('comments/:id/hide')
  @HttpCode(HttpStatus.OK)
  hide(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: HideCommentDto,
  ): Promise<CommentDto> {
    return this.comments.hide(actor, id, dto.reason);
  }

  /** Show a hidden comment again. The event's organisers and admins. */
  @Post('comments/:id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<CommentDto> {
    return this.comments.restore(actor, id);
  }
}
