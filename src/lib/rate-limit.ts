// Instance-local token bucket for the public analysis endpoint. The endpoint
// can trigger billed watsonx calls, so a public demo needs an abuse ceiling.
// The budget stays far above anything a live presentation produces (two
// requests per replay run). Serverless scale-out gives each instance its own
// bucket; that is an accepted demo-scope limitation recorded in the docs.

export const RATE_LIMIT_CAPACITY = 30;
const RATE_LIMIT_REFILL_PER_MS = RATE_LIMIT_CAPACITY / 60_000;
const RATE_LIMIT_MAX_CLIENTS = 1000;

const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export function consumeRateLimit(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: RATE_LIMIT_CAPACITY, updatedAt: now };
  const refilled = Math.min(
    RATE_LIMIT_CAPACITY,
    bucket.tokens + (now - bucket.updatedAt) * RATE_LIMIT_REFILL_PER_MS,
  );
  const allowed = refilled >= 1;
  buckets.set(key, { tokens: allowed ? refilled - 1 : refilled, updatedAt: now });
  if (buckets.size > RATE_LIMIT_MAX_CLIENTS) {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
  return allowed;
}

export function resetRateLimit(): void {
  buckets.clear();
}
