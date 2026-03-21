import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isRateLimitError, extractRetryAfterMs } from '../rate-limit-detector';
import {
  error429Status,
  error429StatusCode,
  error429ResponseStatus,
  errorRateLimitedCode,
  errorRateLimitType,
  errorWithRetryAfterSeconds,
  errorWithHeadersObject,
  error400,
  error500,
  errorAuth,
} from './fixtures/mock-errors';

describe('isRateLimitError', () => {
  it('detects error.status === 429', () => {
    expect(isRateLimitError(error429Status)).toBe(true);
  });

  it('detects error.statusCode === 429', () => {
    expect(isRateLimitError(error429StatusCode)).toBe(true);
  });

  it('detects error.response.status === 429', () => {
    expect(isRateLimitError(error429ResponseStatus)).toBe(true);
  });

  it('detects error.code === "rate_limited"', () => {
    expect(isRateLimitError(errorRateLimitedCode)).toBe(true);
  });

  it('detects error.code === "rate-limited"', () => {
    expect(isRateLimitError({ code: 'rate-limited' })).toBe(true);
  });

  it('detects error.code === "too_many_requests"', () => {
    expect(isRateLimitError({ code: 'too_many_requests' })).toBe(true);
  });

  it('detects error.type === "rate_limit_error"', () => {
    expect(isRateLimitError(errorRateLimitType)).toBe(true);
  });

  it('detects error.type === "tokens"', () => {
    expect(isRateLimitError({ type: 'tokens' })).toBe(true);
  });

  it('detects message containing "Rate limit exceeded" (case insensitive)', () => {
    expect(isRateLimitError({ message: 'Rate limit exceeded' })).toBe(true);
    expect(isRateLimitError({ message: 'RATE LIMIT hit' })).toBe(true);
    expect(isRateLimitError({ message: 'you hit a rate limit, please retry' })).toBe(true);
  });

  it('returns false for error 400', () => {
    expect(isRateLimitError(error400)).toBe(false);
  });

  it('returns false for error 500', () => {
    expect(isRateLimitError(error500)).toBe(false);
  });

  it('returns false for error 401', () => {
    expect(isRateLimitError(errorAuth)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRateLimitError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRateLimitError(undefined)).toBe(false);
  });

  it('returns false for non-object primitives', () => {
    expect(isRateLimitError(42)).toBe(false);
    expect(isRateLimitError('error')).toBe(false);
    expect(isRateLimitError(true)).toBe(false);
  });
});

describe('extractRetryAfterMs', () => {
  const defaultCooldown = 60000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses integer seconds header ("30") to 30000ms', () => {
    const ms = extractRetryAfterMs(errorWithRetryAfterSeconds, defaultCooldown);
    expect(ms).toBe(30000);
  });

  it('parses HTTP date in future to approximately correct ms', () => {
    const futureDate = new Date(Date.now() + 45000).toUTCString();
    const error = { status: 429, headers: { 'retry-after': futureDate } };
    const ms = extractRetryAfterMs(error, defaultCooldown);
    // Should be approximately 45000ms (within a small tolerance for execution time)
    expect(ms).toBeGreaterThan(44000);
    expect(ms).toBeLessThanOrEqual(46000);
  });

  it('parses Headers object with .get() method ("60") to 60000ms', () => {
    const ms = extractRetryAfterMs(errorWithHeadersObject, defaultCooldown);
    expect(ms).toBe(60000);
  });

  it('reads from error.response.headers location', () => {
    const error = {
      status: 429,
      response: { headers: { 'retry-after': '15' } },
    };
    const ms = extractRetryAfterMs(error, defaultCooldown);
    expect(ms).toBe(15000);
  });

  it('reads from error.retryAfter location', () => {
    const error = { status: 429, retryAfter: '20' };
    const ms = extractRetryAfterMs(error, defaultCooldown);
    expect(ms).toBe(20000);
  });

  it('returns defaultCooldownMs when headers are missing', () => {
    const error = { status: 429 };
    const ms = extractRetryAfterMs(error, defaultCooldown);
    expect(ms).toBe(defaultCooldown);
  });

  it('returns defaultCooldownMs for non-429 error without retry-after', () => {
    const ms = extractRetryAfterMs(error400, defaultCooldown);
    expect(ms).toBe(defaultCooldown);
  });

  it('returns defaultCooldownMs for invalid header value', () => {
    const error = { status: 429, headers: { 'retry-after': 'not-a-number-or-date' } };
    const ms = extractRetryAfterMs(error, defaultCooldown);
    expect(ms).toBe(defaultCooldown);
  });

  it('returns defaultCooldownMs when error is null', () => {
    expect(extractRetryAfterMs(null, defaultCooldown)).toBe(defaultCooldown);
  });

  it('returns defaultCooldownMs when error is undefined', () => {
    expect(extractRetryAfterMs(undefined, defaultCooldown)).toBe(defaultCooldown);
  });

  it('returns defaultCooldownMs for "0" seconds', () => {
    const error = { status: 429, headers: { 'retry-after': '0' } };
    const ms = extractRetryAfterMs(error, defaultCooldown);
    expect(ms).toBe(defaultCooldown);
  });

  it('returns defaultCooldownMs for date in the past', () => {
    const pastDate = new Date(Date.now() - 10000).toUTCString();
    const error = { status: 429, headers: { 'retry-after': pastDate } };
    const ms = extractRetryAfterMs(error, defaultCooldown);
    expect(ms).toBe(defaultCooldown);
  });

  it('prefers error.headers over error.response.headers', () => {
    const error = {
      status: 429,
      headers: { 'retry-after': '10' },
      response: { headers: { 'retry-after': '99' } },
    };
    const ms = extractRetryAfterMs(error, defaultCooldown);
    expect(ms).toBe(10000);
  });
});
