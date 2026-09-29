import { IsString, MaxLength, MinLength } from 'class-validator';

export class PostCommentDto {
  /** 1 to 2,000 characters; shown as plain text. */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

export class HideCommentDto {
  /** Why it is hidden: recorded in the audit trail and shown to the event's organisers. */
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export class CommentAuthorDto {
  /** The author's display name. Their email is never shown with a comment. */
  name: string;
}

export class CommentDto {
  id: string;
  author: CommentAuthorDto;
  body: string;
  createdAt: string;
  /** True only in an organiser's view: visitors never receive hidden comments. */
  hidden: boolean;
  /** The organiser's reason, in an organiser's view of a hidden comment; otherwise null. */
  hideReason: string | null;
}
