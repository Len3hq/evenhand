// Liveness of the web server itself (used by the compose healthcheck). Does not call the API.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
