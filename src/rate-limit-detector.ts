// ── Rate Limit Detection ────────────────────────────────────────────

/**
 * Checks whether an error represents a 429 rate limit response.
 *
 * Detection strategies (checked in order):
 * 1. error.status === 429
 * 2. error.statusCode === 429
 * 3. error.response?.status === 429
 * 4. error.code is 'rate_limited', 'rate-limited', or 'too_many_requests'
 * 5. error.type is 'rate_limit_error' or 'tokens'
 * 6. error.message contains 'rate limit' (case-insensitive, last resort)
 */
export function isRateLimitError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }

  const err = error as Record<string, unknown>;

  // 1. error.status === 429
  if (err.status === 429) {
    return true;
  }

  // 2. error.statusCode === 429
  if (err.statusCode === 429) {
    return true;
  }

  // 3. error.response?.status === 429
  if (
    err.response != null &&
    typeof err.response === 'object' &&
    (err.response as Record<string, unknown>).status === 429
  ) {
    return true;
  }

  // 4. error.code is 'rate_limited', 'rate-limited', or 'too_many_requests'
  if (
    err.code === 'rate_limited' ||
    err.code === 'rate-limited' ||
    err.code === 'too_many_requests'
  ) {
    return true;
  }

  // 5. error.type is 'rate_limit_error' or 'tokens'
  if (err.type === 'rate_limit_error' || err.type === 'tokens') {
    return true;
  }

  // 6. error.message contains 'rate limit' (case-insensitive, last resort)
  if (typeof err.message === 'string' && /rate limit/i.test(err.message)) {
    return true;
  }

  return false;
}

// ── Retry-After Extraction ──────────────────────────────────────────

/**
 * Extracts the Retry-After duration from an error's headers.
 *
 * Check locations in order:
 * 1. error.headers?.['retry-after']
 * 2. error.response?.headers?.['retry-after']
 * 3. error.retryAfter
 * 4. error.headers?.get?.('retry-after') (for fetch Headers API)
 *
 * Parse the value:
 * - Positive integer string -> seconds * 1000 (ms)
 * - Date string -> Math.max(0, date - now), falls back to default if in the past
 * - Parsing failure or missing -> defaultCooldownMs
 */
export function extractRetryAfterMs(error: unknown, defaultCooldownMs: number): number {
  if (error == null || typeof error !== 'object') {
    return defaultCooldownMs;
  }

  const err = error as Record<string, unknown>;
  const raw = findRetryAfterValue(err);

  if (raw == null) {
    return defaultCooldownMs;
  }

  return parseRetryAfterValue(raw, defaultCooldownMs);
}

function findRetryAfterValue(err: Record<string, unknown>): unknown {
  // 1. error.headers?.['retry-after']
  if (err.headers != null && typeof err.headers === 'object') {
    const headers = err.headers as Record<string, unknown>;
    if (headers['retry-after'] != null) {
      return headers['retry-after'];
    }

    // 4. error.headers?.get?.('retry-after') (fetch Headers API)
    if (typeof headers.get === 'function') {
      const val = (headers.get as (name: string) => unknown)('retry-after');
      if (val != null) {
        return val;
      }
    }
  }

  // 2. error.response?.headers?.['retry-after']
  if (err.response != null && typeof err.response === 'object') {
    const response = err.response as Record<string, unknown>;
    if (response.headers != null && typeof response.headers === 'object') {
      const responseHeaders = response.headers as Record<string, unknown>;
      if (responseHeaders['retry-after'] != null) {
        return responseHeaders['retry-after'];
      }
    }
  }

  // 3. error.retryAfter
  if (err.retryAfter != null) {
    return err.retryAfter;
  }

  return null;
}

function parseRetryAfterValue(value: unknown, defaultCooldownMs: number): number {
  const str = String(value);

  // Try parsing as a positive integer (seconds)
  if (/^\d+$/.test(str)) {
    const seconds = parseInt(str, 10);
    if (seconds > 0) {
      return seconds * 1000;
    }
    return defaultCooldownMs;
  }

  // Try parsing as a date string
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now();
    if (ms > 0) {
      return ms;
    }
    return defaultCooldownMs;
  }

  return defaultCooldownMs;
}
