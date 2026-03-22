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
export declare function isRateLimitError(error: unknown): boolean;
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
export declare function extractRetryAfterMs(error: unknown, defaultCooldownMs: number): number;
//# sourceMappingURL=rate-limit-detector.d.ts.map