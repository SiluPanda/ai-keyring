"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rate_limit_detector_1 = require("../rate-limit-detector");
const mock_errors_1 = require("./fixtures/mock-errors");
(0, vitest_1.describe)('isRateLimitError', () => {
    (0, vitest_1.it)('detects error.status === 429', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(mock_errors_1.error429Status)).toBe(true);
    });
    (0, vitest_1.it)('detects error.statusCode === 429', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(mock_errors_1.error429StatusCode)).toBe(true);
    });
    (0, vitest_1.it)('detects error.response.status === 429', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(mock_errors_1.error429ResponseStatus)).toBe(true);
    });
    (0, vitest_1.it)('detects error.code === "rate_limited"', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(mock_errors_1.errorRateLimitedCode)).toBe(true);
    });
    (0, vitest_1.it)('detects error.code === "rate-limited"', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)({ code: 'rate-limited' })).toBe(true);
    });
    (0, vitest_1.it)('detects error.code === "too_many_requests"', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)({ code: 'too_many_requests' })).toBe(true);
    });
    (0, vitest_1.it)('detects error.type === "rate_limit_error"', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(mock_errors_1.errorRateLimitType)).toBe(true);
    });
    (0, vitest_1.it)('detects error.type === "tokens"', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)({ type: 'tokens' })).toBe(true);
    });
    (0, vitest_1.it)('detects message containing "Rate limit exceeded" (case insensitive)', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)({ message: 'Rate limit exceeded' })).toBe(true);
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)({ message: 'RATE LIMIT hit' })).toBe(true);
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)({ message: 'you hit a rate limit, please retry' })).toBe(true);
    });
    (0, vitest_1.it)('returns false for error 400', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(mock_errors_1.error400)).toBe(false);
    });
    (0, vitest_1.it)('returns false for error 500', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(mock_errors_1.error500)).toBe(false);
    });
    (0, vitest_1.it)('returns false for error 401', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(mock_errors_1.errorAuth)).toBe(false);
    });
    (0, vitest_1.it)('returns false for null', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(null)).toBe(false);
    });
    (0, vitest_1.it)('returns false for undefined', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(undefined)).toBe(false);
    });
    (0, vitest_1.it)('returns false for non-object primitives', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(42)).toBe(false);
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)('error')).toBe(false);
        (0, vitest_1.expect)((0, rate_limit_detector_1.isRateLimitError)(true)).toBe(false);
    });
});
(0, vitest_1.describe)('extractRetryAfterMs', () => {
    const defaultCooldown = 60000;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('parses integer seconds header ("30") to 30000ms', () => {
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(mock_errors_1.errorWithRetryAfterSeconds, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(30000);
    });
    (0, vitest_1.it)('parses HTTP date in future to approximately correct ms', () => {
        const futureDate = new Date(Date.now() + 45000).toUTCString();
        const error = { status: 429, headers: { 'retry-after': futureDate } };
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldown);
        // Should be approximately 45000ms (within a small tolerance for execution time)
        (0, vitest_1.expect)(ms).toBeGreaterThan(44000);
        (0, vitest_1.expect)(ms).toBeLessThanOrEqual(46000);
    });
    (0, vitest_1.it)('parses Headers object with .get() method ("60") to 60000ms', () => {
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(mock_errors_1.errorWithHeadersObject, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(60000);
    });
    (0, vitest_1.it)('reads from error.response.headers location', () => {
        const error = {
            status: 429,
            response: { headers: { 'retry-after': '15' } },
        };
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(15000);
    });
    (0, vitest_1.it)('reads from error.retryAfter location', () => {
        const error = { status: 429, retryAfter: '20' };
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(20000);
    });
    (0, vitest_1.it)('returns defaultCooldownMs when headers are missing', () => {
        const error = { status: 429 };
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(defaultCooldown);
    });
    (0, vitest_1.it)('returns defaultCooldownMs for non-429 error without retry-after', () => {
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(mock_errors_1.error400, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(defaultCooldown);
    });
    (0, vitest_1.it)('returns defaultCooldownMs for invalid header value', () => {
        const error = { status: 429, headers: { 'retry-after': 'not-a-number-or-date' } };
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(defaultCooldown);
    });
    (0, vitest_1.it)('returns defaultCooldownMs when error is null', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.extractRetryAfterMs)(null, defaultCooldown)).toBe(defaultCooldown);
    });
    (0, vitest_1.it)('returns defaultCooldownMs when error is undefined', () => {
        (0, vitest_1.expect)((0, rate_limit_detector_1.extractRetryAfterMs)(undefined, defaultCooldown)).toBe(defaultCooldown);
    });
    (0, vitest_1.it)('returns defaultCooldownMs for "0" seconds', () => {
        const error = { status: 429, headers: { 'retry-after': '0' } };
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(defaultCooldown);
    });
    (0, vitest_1.it)('returns defaultCooldownMs for date in the past', () => {
        const pastDate = new Date(Date.now() - 10000).toUTCString();
        const error = { status: 429, headers: { 'retry-after': pastDate } };
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(defaultCooldown);
    });
    (0, vitest_1.it)('prefers error.headers over error.response.headers', () => {
        const error = {
            status: 429,
            headers: { 'retry-after': '10' },
            response: { headers: { 'retry-after': '99' } },
        };
        const ms = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldown);
        (0, vitest_1.expect)(ms).toBe(10000);
    });
});
//# sourceMappingURL=rate-limit-detector.test.js.map