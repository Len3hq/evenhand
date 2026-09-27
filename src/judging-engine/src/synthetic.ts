import type { ScoredReview } from './normalize.js';
import { createRng, type Rng, shuffle } from './rng.js';

/**
 * A synthetic hackathon with a known truth, for the Normalization Proof (decision 52): every
 * project has a true quality, every judge a true leniency, tracks differ in strength, and each
 * review is truth + leniency + noise. Seeded, so every run can be reproduced.
 */
export interface SyntheticEvent {
  reviews: ScoredReview[];
  /** The true quality of each project, which no method sees. */
  quality: Map<string, number>;
  bias: Map<string, number>;
}

export interface SyntheticOptions {
  seed: number;
  tracks?: number;
  projectsPerTrack?: number;
  judgesPerTrack?: number;
  /** Judges who also review in a second track: they link the tracks. */
  bridgeJudges?: number;
  reviewsPerProject?: number;
  /** Standard deviations on the score scale. */
  qualitySd?: number;
  biasSd?: number;
  trackSd?: number;
  noiseSd?: number;
}

export function syntheticEvent(o: SyntheticOptions): SyntheticEvent {
  const rng = createRng(o.seed);
  const tracks = o.tracks ?? 5;
  const perTrack = o.projectsPerTrack ?? 8;
  const judgesPerTrack = o.judgesPerTrack ?? 5;
  const bridges = o.bridgeJudges ?? 5;
  const k = o.reviewsPerProject ?? 3;
  const normal = gaussian(rng);

  const quality = new Map<string, number>();
  const bias = new Map<string, number>();
  const trackJudges: string[][] = [];
  for (let t = 0; t < tracks; t++) {
    const strength = normal() * (o.trackSd ?? 0.4);
    for (let i = 0; i < perTrack; i++) {
      quality.set(`t${t}p${i}`, strength + normal() * (o.qualitySd ?? 0.6));
    }
    trackJudges.push(
      Array.from({ length: judgesPerTrack }, (_, i) => {
        const id = `t${t}j${i}`;
        bias.set(id, normal() * (o.biasSd ?? 0.5));
        return id;
      }),
    );
  }
  // Bridge judges cover two neighbouring tracks.
  for (let b = 0; b < bridges; b++) {
    const id = `bridge${b}`;
    bias.set(id, normal() * (o.biasSd ?? 0.5));
    trackJudges[b % tracks]!.push(id);
    trackJudges[(b + 1) % tracks]!.push(id);
  }

  const reviews: ScoredReview[] = [];
  for (let t = 0; t < tracks; t++) {
    for (let i = 0; i < perTrack; i++) {
      const projectId = `t${t}p${i}`;
      for (const judgeId of shuffle(trackJudges[t]!, rng).slice(0, k)) {
        const score =
          3 + quality.get(projectId)! + bias.get(judgeId)! + normal() * (o.noiseSd ?? 0.4);
        reviews.push({ judgeId, projectId, score });
      }
    }
  }
  return { reviews, quality, bias };
}

/** Standard normal draws from a seeded generator (Box–Muller). */
function gaussian(rng: Rng): () => number {
  return () => {
    const u = Math.max(rng.next(), Number.MIN_VALUE);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };
}
