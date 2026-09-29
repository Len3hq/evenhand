/**
 * Typed application configuration, read once from the environment at start-up.
 * Anything missing or malformed stops the process with a clear message rather than
 * failing later on the first request.
 */
export class AppConfig {
  constructor(
    readonly databaseUrl: string,
    readonly port: number,
    /** Demo mode seeds fixed tokens/passwords and accepts demo tokens. Never enable in production. */
    readonly demoMode: boolean,
    readonly demoPassword: string,
    /** Origins allowed to make cookie-authenticated writes (CSRF defence). */
    readonly allowedOrigins: readonly string[],
    readonly rateLimitDefaultPerMin: number,
    readonly rateLimitLoginPerMin: number,
    /** CSV and JSON exports per minute per address. */
    readonly rateLimitExportPerMin: number,
    /** Judge review saves and submits per minute per address (autosave included). */
    readonly rateLimitReviewPerMin: number,
    /** Image uploads per minute per address: each is decoded and re-encoded, so it costs CPU. */
    readonly rateLimitUploadPerMin: number,
    /**
     * Image downloads per minute per address. Separate from the default limit because one gallery
     * page loads many thumbnails, and a venue shares one address behind its NAT.
     */
    readonly rateLimitImagePerMin: number,
    /** Comments posted per minute per address. */
    readonly rateLimitCommentPerMin: number,
    /** Votes cast or withdrawn, and voting links taken from an open link, per minute per address. */
    readonly rateLimitVotePerMin: number,
    /** Failed token or session checks per minute per address before it is refused for the minute. */
    readonly authFailuresPerMin: number,
    readonly uploadsDir: string,
    readonly sessionTtlHours: number,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const problems: string[] = [];
    const str = (name: string, fallback?: string): string => {
      const v = env[name] ?? fallback;
      if (v === undefined || v === '') problems.push(`${name} is required`);
      return v ?? '';
    };
    const int = (name: string, fallback: number): number => {
      const raw = env[name];
      if (raw === undefined || raw === '') return fallback;
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0)
        problems.push(`${name} must be a positive integer, got "${raw}"`);
      return n;
    };
    const bool = (name: string, fallback: boolean): boolean => {
      const raw = env[name];
      if (raw === undefined || raw === '') return fallback;
      if (raw !== 'true' && raw !== 'false')
        problems.push(`${name} must be "true" or "false", got "${raw}"`);
      return raw === 'true';
    };

    const config = new AppConfig(
      str('DATABASE_URL'),
      int('PORT', 3001),
      bool('DEMO_MODE', false),
      env.DEMO_PASSWORD ?? 'evenhand-demo',
      (env.ALLOWED_ORIGINS ?? 'http://localhost:8080')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      int('RATE_LIMIT_DEFAULT_PER_MIN', 300),
      int('RATE_LIMIT_LOGIN_PER_MIN', 10),
      int('RATE_LIMIT_EXPORT_PER_MIN', 30),
      int('RATE_LIMIT_REVIEW_PER_MIN', 120),
      int('RATE_LIMIT_UPLOAD_PER_MIN', 30),
      int('RATE_LIMIT_IMAGE_PER_MIN', 3000),
      int('RATE_LIMIT_COMMENT_PER_MIN', 10),
      int('RATE_LIMIT_VOTE_PER_MIN', 60),
      int('AUTH_FAILURES_PER_MIN', 20),
      env.UPLOADS_DIR ?? './uploads',
      int('SESSION_TTL_HOURS', 24 * 7),
    );
    if (problems.length > 0) {
      throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    }
    return config;
  }
}
