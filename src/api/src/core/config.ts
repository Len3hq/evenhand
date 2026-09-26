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
      env.UPLOADS_DIR ?? './uploads',
      int('SESSION_TTL_HOURS', 24 * 7),
    );
    if (problems.length > 0) {
      throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    }
    return config;
  }
}
