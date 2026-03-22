"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const usage_tracker_1 = require("../usage-tracker");
(0, vitest_1.describe)('UsageTracker', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.describe)('recordRequest', () => {
        (0, vitest_1.it)('increments request count', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordRequest('key-1');
            tracker.recordRequest('key-1');
            tracker.recordRequest('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.requests).toBe(3);
        });
        (0, vitest_1.it)('sets lastUsedAt to current ISO timestamp', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordRequest('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.lastUsedAt).toBe('2026-03-21T12:00:00.000Z');
        });
        (0, vitest_1.it)('updates lastUsedAt on subsequent requests', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordRequest('key-1');
            vitest_1.vi.advanceTimersByTime(5000);
            tracker.recordRequest('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.lastUsedAt).toBe('2026-03-21T12:00:05.000Z');
        });
    });
    (0, vitest_1.describe)('recordUsage', () => {
        (0, vitest_1.it)('accumulates tokens', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordUsage('key-1', { tokens: 100 });
            tracker.recordUsage('key-1', { tokens: 200 });
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.tokens).toBe(300);
        });
        (0, vitest_1.it)('accumulates inputTokens', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordUsage('key-1', { inputTokens: 50 });
            tracker.recordUsage('key-1', { inputTokens: 75 });
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.inputTokens).toBe(125);
        });
        (0, vitest_1.it)('accumulates outputTokens', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordUsage('key-1', { outputTokens: 30 });
            tracker.recordUsage('key-1', { outputTokens: 20 });
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.outputTokens).toBe(50);
        });
        (0, vitest_1.it)('accumulates cost', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordUsage('key-1', { cost: 0.01 });
            tracker.recordUsage('key-1', { cost: 0.02 });
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.cost).toBeCloseTo(0.03);
        });
        (0, vitest_1.it)('records latencyMs into rolling window', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordUsage('key-1', { latencyMs: 100 });
            tracker.recordUsage('key-1', { latencyMs: 200 });
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(150);
        });
        (0, vitest_1.it)('handles empty usage report without crashing', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordUsage('key-1', {});
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.tokens).toBe(0);
            (0, vitest_1.expect)(metrics.inputTokens).toBe(0);
            (0, vitest_1.expect)(metrics.outputTokens).toBe(0);
            (0, vitest_1.expect)(metrics.cost).toBe(0);
        });
        (0, vitest_1.it)('accumulates all fields together', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordUsage('key-1', {
                tokens: 500,
                inputTokens: 300,
                outputTokens: 200,
                cost: 0.05,
                latencyMs: 150,
            });
            tracker.recordUsage('key-1', {
                tokens: 400,
                inputTokens: 250,
                outputTokens: 150,
                cost: 0.04,
                latencyMs: 250,
            });
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.tokens).toBe(900);
            (0, vitest_1.expect)(metrics.inputTokens).toBe(550);
            (0, vitest_1.expect)(metrics.outputTokens).toBe(350);
            (0, vitest_1.expect)(metrics.cost).toBeCloseTo(0.09);
            (0, vitest_1.expect)(metrics.avgLatencyMs).toBe(200);
        });
    });
    (0, vitest_1.describe)('recordError', () => {
        (0, vitest_1.it)('increments error count', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordError('key-1');
            tracker.recordError('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.errors).toBe(2);
        });
        (0, vitest_1.it)('sets lastErrorAt to current ISO timestamp', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordError('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.lastErrorAt).toBe('2026-03-21T12:00:00.000Z');
        });
        (0, vitest_1.it)('updates lastErrorAt on subsequent errors', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordError('key-1');
            vitest_1.vi.advanceTimersByTime(10000);
            tracker.recordError('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.lastErrorAt).toBe('2026-03-21T12:00:10.000Z');
        });
    });
    (0, vitest_1.describe)('recordRateLimit', () => {
        (0, vitest_1.it)('increments rateLimits count', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordRateLimit('key-1');
            tracker.recordRateLimit('key-1');
            tracker.recordRateLimit('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.rateLimits).toBe(3);
        });
    });
    (0, vitest_1.describe)('getErrorRate — rolling window', () => {
        (0, vitest_1.it)('computes error rate within the window', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            // 4 requests, 1 error -> 25% error rate
            tracker.recordRequest('key-1');
            tracker.recordRequest('key-1');
            tracker.recordRequest('key-1');
            tracker.recordRequest('key-1');
            tracker.recordError('key-1');
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(0.25);
        });
        (0, vitest_1.it)('returns 0 when no requests in window', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(0);
        });
        (0, vitest_1.it)('returns 0 when there are requests but no errors', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            tracker.recordRequest('key-1');
            tracker.recordRequest('key-1');
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(0);
        });
        (0, vitest_1.it)('prunes old entries after metricsWindowMs', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            // Record requests and an error
            tracker.recordRequest('key-1');
            tracker.recordError('key-1');
            // Error rate should be 1.0 (1 error / 1 request)
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(1.0);
            // Advance past the window
            vitest_1.vi.advanceTimersByTime(61_000);
            // Record new request without error
            tracker.recordRequest('key-1');
            // Old entries pruned, only the new request remains
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(0);
        });
        (0, vitest_1.it)('error rate changes as window slides', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            // T=0: request + error
            tracker.recordRequest('key-1');
            tracker.recordError('key-1');
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(1.0);
            // T=30s: request (no error)
            vitest_1.vi.advanceTimersByTime(30_000);
            tracker.recordRequest('key-1');
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(0.5);
            // T=61s: old entries pruned, only T=30s request remains
            vitest_1.vi.advanceTimersByTime(31_000);
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(0);
        });
    });
    (0, vitest_1.describe)('getAvgLatencyMs — rolling window', () => {
        (0, vitest_1.it)('computes average latency within the window', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            tracker.recordUsage('key-1', { latencyMs: 100 });
            tracker.recordUsage('key-1', { latencyMs: 200 });
            tracker.recordUsage('key-1', { latencyMs: 300 });
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(200);
        });
        (0, vitest_1.it)('returns 0 when no latency entries', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(0);
        });
        (0, vitest_1.it)('prunes old latency entries after metricsWindowMs', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            // T=0: record latency 100ms
            tracker.recordUsage('key-1', { latencyMs: 100 });
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(100);
            // T=61s: old entry pruned
            vitest_1.vi.advanceTimersByTime(61_000);
            // Record new latency 300ms
            tracker.recordUsage('key-1', { latencyMs: 300 });
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(300);
        });
        (0, vitest_1.it)('average latency changes as window slides', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            // T=0: 100ms
            tracker.recordUsage('key-1', { latencyMs: 100 });
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(100);
            // T=30s: 300ms -> avg 200
            vitest_1.vi.advanceTimersByTime(30_000);
            tracker.recordUsage('key-1', { latencyMs: 300 });
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(200);
            // T=61s: T=0 entry pruned, only T=30s entry remains -> 300
            vitest_1.vi.advanceTimersByTime(31_000);
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(300);
        });
    });
    (0, vitest_1.describe)('metricsWindowMs = 0 disables rolling metrics', () => {
        (0, vitest_1.it)('getErrorRate returns 0', () => {
            const tracker = new usage_tracker_1.UsageTracker(0);
            tracker.recordRequest('key-1');
            tracker.recordError('key-1');
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(0);
        });
        (0, vitest_1.it)('getAvgLatencyMs returns 0', () => {
            const tracker = new usage_tracker_1.UsageTracker(0);
            tracker.recordUsage('key-1', { latencyMs: 100 });
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(0);
        });
        (0, vitest_1.it)('still tracks cumulative metrics', () => {
            const tracker = new usage_tracker_1.UsageTracker(0);
            tracker.recordRequest('key-1');
            tracker.recordUsage('key-1', { tokens: 100, cost: 0.01 });
            tracker.recordError('key-1');
            tracker.recordRateLimit('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics.requests).toBe(1);
            (0, vitest_1.expect)(metrics.tokens).toBe(100);
            (0, vitest_1.expect)(metrics.cost).toBeCloseTo(0.01);
            (0, vitest_1.expect)(metrics.errors).toBe(1);
            (0, vitest_1.expect)(metrics.rateLimits).toBe(1);
        });
    });
    (0, vitest_1.describe)('getMetrics', () => {
        (0, vitest_1.it)('returns complete shape with all fields', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordRequest('key-1');
            tracker.recordUsage('key-1', {
                tokens: 500,
                inputTokens: 300,
                outputTokens: 200,
                latencyMs: 150,
                cost: 0.05,
            });
            tracker.recordError('key-1');
            tracker.recordRateLimit('key-1');
            const metrics = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(metrics).toEqual(vitest_1.expect.objectContaining({
                requests: 1,
                tokens: 500,
                inputTokens: 300,
                outputTokens: 200,
                errors: 1,
                rateLimits: 1,
                cost: vitest_1.expect.closeTo(0.05),
                lastUsedAt: vitest_1.expect.any(String),
                lastErrorAt: vitest_1.expect.any(String),
                errorRate: vitest_1.expect.any(Number),
                avgLatencyMs: vitest_1.expect.any(Number),
            }));
        });
        (0, vitest_1.it)('returns zero/null defaults for uninitialized key', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            const metrics = tracker.getMetrics('new-key');
            (0, vitest_1.expect)(metrics.requests).toBe(0);
            (0, vitest_1.expect)(metrics.tokens).toBe(0);
            (0, vitest_1.expect)(metrics.inputTokens).toBe(0);
            (0, vitest_1.expect)(metrics.outputTokens).toBe(0);
            (0, vitest_1.expect)(metrics.errors).toBe(0);
            (0, vitest_1.expect)(metrics.rateLimits).toBe(0);
            (0, vitest_1.expect)(metrics.cost).toBe(0);
            (0, vitest_1.expect)(metrics.lastUsedAt).toBeNull();
            (0, vitest_1.expect)(metrics.lastErrorAt).toBeNull();
            (0, vitest_1.expect)(metrics.errorRate).toBe(0);
            (0, vitest_1.expect)(metrics.avgLatencyMs).toBe(0);
        });
    });
    (0, vitest_1.describe)('multiple keys tracked independently', () => {
        (0, vitest_1.it)('tracks separate metrics per key', () => {
            const tracker = new usage_tracker_1.UsageTracker();
            tracker.recordRequest('key-1');
            tracker.recordRequest('key-1');
            tracker.recordUsage('key-1', { tokens: 100 });
            tracker.recordError('key-1');
            tracker.recordRequest('key-2');
            tracker.recordUsage('key-2', { tokens: 500 });
            tracker.recordRateLimit('key-2');
            const m1 = tracker.getMetrics('key-1');
            (0, vitest_1.expect)(m1.requests).toBe(2);
            (0, vitest_1.expect)(m1.tokens).toBe(100);
            (0, vitest_1.expect)(m1.errors).toBe(1);
            (0, vitest_1.expect)(m1.rateLimits).toBe(0);
            const m2 = tracker.getMetrics('key-2');
            (0, vitest_1.expect)(m2.requests).toBe(1);
            (0, vitest_1.expect)(m2.tokens).toBe(500);
            (0, vitest_1.expect)(m2.errors).toBe(0);
            (0, vitest_1.expect)(m2.rateLimits).toBe(1);
        });
        (0, vitest_1.it)('error rates are independent per key', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            // key-1: 2 requests, 2 errors -> 100%
            tracker.recordRequest('key-1');
            tracker.recordRequest('key-1');
            tracker.recordError('key-1');
            tracker.recordError('key-1');
            // key-2: 4 requests, 0 errors -> 0%
            tracker.recordRequest('key-2');
            tracker.recordRequest('key-2');
            tracker.recordRequest('key-2');
            tracker.recordRequest('key-2');
            (0, vitest_1.expect)(tracker.getErrorRate('key-1')).toBe(1.0);
            (0, vitest_1.expect)(tracker.getErrorRate('key-2')).toBe(0);
        });
        (0, vitest_1.it)('latency averages are independent per key', () => {
            const tracker = new usage_tracker_1.UsageTracker(60_000);
            tracker.recordUsage('key-1', { latencyMs: 100 });
            tracker.recordUsage('key-1', { latencyMs: 200 });
            tracker.recordUsage('key-2', { latencyMs: 500 });
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-1')).toBe(150);
            (0, vitest_1.expect)(tracker.getAvgLatencyMs('key-2')).toBe(500);
        });
    });
});
//# sourceMappingURL=usage-tracker.test.js.map