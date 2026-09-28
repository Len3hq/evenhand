import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Every machine-readable error code the API can return. Clients (and the web UI) branch on
 * `error`, never on `message`. Add new codes here, in snake_case.
 */
export const ERROR_CODES = [
  'unauthenticated',
  'invalid_credentials',
  'demo_token_disabled',
  'origin_not_allowed',
  'forbidden',
  'not_a_team_member',
  'submissions_closed',
  'submissions_not_open',
  'team_already_has_submission',
  'submission_superseded',
  'email_taken',
  'slug_taken',
  'track_name_taken',
  'track_in_use',
  'already_on_team',
  'already_organizer',
  'conflict_of_interest',
  'last_organizer',
  'rubric_locked',
  'questions_locked',
  'already_judge',
  'judging_closed',
  'judge_has_reviews',
  'review_final',
  'nothing_to_rank',
  'ranking_stale',
  'results_not_published',
  'duplicate_decided',
  'duplicate_same_team',
  'duplicate_chain',
  'not_submitted',
  'already_disqualified',
  'not_disqualified',
  'not_in_judging',
  'team_name_taken',
  'invite_expired',
  'invite_used_up',
  'ambiguous_reference',
  'validation_failed',
  'not_found',
  'rate_limited',
  'internal_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** The one error body shape: `{ statusCode, error, message }`. */
export interface ErrorBody {
  statusCode: number;
  error: ErrorCode | string;
  message: string;
}

/**
 * A deliberate, expected refusal. Throw it from services and guards:
 *   throw new DomainError(403, 'submissions_closed', 'Submissions closed at …');
 */
export class DomainError extends HttpException {
  constructor(status: number, code: ErrorCode, message?: string) {
    super(
      {
        statusCode: status,
        error: code,
        message: message ?? code.replaceAll('_', ' '),
      } satisfies ErrorBody,
      status,
    );
  }
}

/** Convenience for the most common refusal. Same body whatever the reason, so nothing leaks. */
export const forbidden = (message = 'You are not allowed to do this.'): DomainError =>
  new DomainError(HttpStatus.FORBIDDEN, 'forbidden', message);

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'validation_failed',
  [HttpStatus.UNAUTHORIZED]: 'unauthenticated',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
};

/**
 * Normalises every error to `{ statusCode, error, message }` and never redirects.
 * Unexpected errors are logged with their stack and answered with a generic 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (!(exception instanceof HttpException)) {
      return { statusCode: 500, error: 'internal_error', message: 'Something went wrong.' };
    }
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null) {
      const r = response as { error?: unknown; message?: unknown };
      const isOwnCode =
        typeof r.error === 'string' && (ERROR_CODES as readonly string[]).includes(r.error);
      const message = Array.isArray(r.message)
        ? r.message.join('; ')
        : String(r.message ?? exception.message);
      return {
        statusCode,
        error: isOwnCode ? (r.error as ErrorCode) : (STATUS_CODES[statusCode] ?? 'internal_error'),
        message,
      };
    }
    return {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'internal_error',
      message: String(response),
    };
  }
}
