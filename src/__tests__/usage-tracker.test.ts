import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UsageTracker } from '../usage-tracker';

describe('UsageTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordRequest', () => {
    it('increments request count', () => {
      const tracker = new UsageTracker();
      tracker.recordRequest('key-1');
      tracker.recordRequest('key-1');
      tracker.recordRequest('key-1');

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.requests).toBe(3);
    });

    it('sets lastUsedAt to current ISO timestamp', () => {
      const tracker = new UsageTracker();
      tracker.recordRequest('key-1');

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.lastUsedAt).toBe('2026-03-21T12:00:00.000Z');
    });

    it('updates lastUsedAt on subsequent requests', () => {
      const tracker = new UsageTracker();
      tracker.recordRequest('key-1');

      vi.advanceTimersByTime(5000);
      tracker.recordRequest('key-1');

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.lastUsedAt).toBe('2026-03-21T12:00:05.000Z');
    });
  });

  describe('recordUsage', () => {
    it('accumulates tokens', () => {
      const tracker = new UsageTracker();
      tracker.recordUsage('key-1', { tokens: 100 });
      tracker.recordUsage('key-1', { tokens: 200 });

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.tokens).toBe(300);
    });

    it('accumulates inputTokens', () => {
      const tracker = new UsageTracker();
      tracker.recordUsage('key-1', { inputTokens: 50 });
      tracker.recordUsage('key-1', { inputTokens: 75 });

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.inputTokens).toBe(125);
    });

    it('accumulates outputTokens', () => {
      const tracker = new UsageTracker();
      tracker.recordUsage('key-1', { outputTokens: 30 });
      tracker.recordUsage('key-1', { outputTokens: 20 });

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.outputTokens).toBe(50);
    });

    it('accumulates cost', () => {
      const tracker = new UsageTracker();
      tracker.recordUsage('key-1', { cost: 0.01 });
      tracker.recordUsage('key-1', { cost: 0.02 });

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.cost).toBeCloseTo(0.03);
    });

    it('records latencyMs into rolling window', () => {
      const tracker = new UsageTracker();
      tracker.recordUsage('key-1', { latencyMs: 100 });
      tracker.recordUsage('key-1', { latencyMs: 200 });

      expect(tracker.getAvgLatencyMs('key-1')).toBe(150);
    });

    it('handles empty usage report without crashing', () => {
      const tracker = new UsageTracker();
      tracker.recordUsage('key-1', {});

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.tokens).toBe(0);
      expect(metrics.inputTokens).toBe(0);
      expect(metrics.outputTokens).toBe(0);
      expect(metrics.cost).toBe(0);
    });

    it('accumulates all fields together', () => {
      const tracker = new UsageTracker();
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
      expect(metrics.tokens).toBe(900);
      expect(metrics.inputTokens).toBe(550);
      expect(metrics.outputTokens).toBe(350);
      expect(metrics.cost).toBeCloseTo(0.09);
      expect(metrics.avgLatencyMs).toBe(200);
    });
  });

  describe('recordError', () => {
    it('increments error count', () => {
      const tracker = new UsageTracker();
      tracker.recordError('key-1');
      tracker.recordError('key-1');

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.errors).toBe(2);
    });

    it('sets lastErrorAt to current ISO timestamp', () => {
      const tracker = new UsageTracker();
      tracker.recordError('key-1');

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.lastErrorAt).toBe('2026-03-21T12:00:00.000Z');
    });

    it('updates lastErrorAt on subsequent errors', () => {
      const tracker = new UsageTracker();
      tracker.recordError('key-1');

      vi.advanceTimersByTime(10000);
      tracker.recordError('key-1');

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.lastErrorAt).toBe('2026-03-21T12:00:10.000Z');
    });
  });

  describe('recordRateLimit', () => {
    it('increments rateLimits count', () => {
      const tracker = new UsageTracker();
      tracker.recordRateLimit('key-1');
      tracker.recordRateLimit('key-1');
      tracker.recordRateLimit('key-1');

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.rateLimits).toBe(3);
    });
  });

  describe('getErrorRate — rolling window', () => {
    it('computes error rate within the window', () => {
      const tracker = new UsageTracker(60_000);

      // 4 requests, 1 error -> 25% error rate
      tracker.recordRequest('key-1');
      tracker.recordRequest('key-1');
      tracker.recordRequest('key-1');
      tracker.recordRequest('key-1');
      tracker.recordError('key-1');

      expect(tracker.getErrorRate('key-1')).toBe(0.25);
    });

    it('returns 0 when no requests in window', () => {
      const tracker = new UsageTracker(60_000);
      expect(tracker.getErrorRate('key-1')).toBe(0);
    });

    it('returns 0 when there are requests but no errors', () => {
      const tracker = new UsageTracker(60_000);
      tracker.recordRequest('key-1');
      tracker.recordRequest('key-1');

      expect(tracker.getErrorRate('key-1')).toBe(0);
    });

    it('prunes old entries after metricsWindowMs', () => {
      const tracker = new UsageTracker(60_000);

      // Record requests and an error
      tracker.recordRequest('key-1');
      tracker.recordError('key-1');

      // Error rate should be 1.0 (1 error / 1 request)
      expect(tracker.getErrorRate('key-1')).toBe(1.0);

      // Advance past the window
      vi.advanceTimersByTime(61_000);

      // Record new request without error
      tracker.recordRequest('key-1');

      // Old entries pruned, only the new request remains
      expect(tracker.getErrorRate('key-1')).toBe(0);
    });

    it('error rate changes as window slides', () => {
      const tracker = new UsageTracker(60_000);

      // T=0: request + error
      tracker.recordRequest('key-1');
      tracker.recordError('key-1');
      expect(tracker.getErrorRate('key-1')).toBe(1.0);

      // T=30s: request (no error)
      vi.advanceTimersByTime(30_000);
      tracker.recordRequest('key-1');
      expect(tracker.getErrorRate('key-1')).toBe(0.5);

      // T=61s: old entries pruned, only T=30s request remains
      vi.advanceTimersByTime(31_000);
      expect(tracker.getErrorRate('key-1')).toBe(0);
    });
  });

  describe('getAvgLatencyMs — rolling window', () => {
    it('computes average latency within the window', () => {
      const tracker = new UsageTracker(60_000);
      tracker.recordUsage('key-1', { latencyMs: 100 });
      tracker.recordUsage('key-1', { latencyMs: 200 });
      tracker.recordUsage('key-1', { latencyMs: 300 });

      expect(tracker.getAvgLatencyMs('key-1')).toBe(200);
    });

    it('returns 0 when no latency entries', () => {
      const tracker = new UsageTracker(60_000);
      expect(tracker.getAvgLatencyMs('key-1')).toBe(0);
    });

    it('prunes old latency entries after metricsWindowMs', () => {
      const tracker = new UsageTracker(60_000);

      // T=0: record latency 100ms
      tracker.recordUsage('key-1', { latencyMs: 100 });
      expect(tracker.getAvgLatencyMs('key-1')).toBe(100);

      // T=61s: old entry pruned
      vi.advanceTimersByTime(61_000);

      // Record new latency 300ms
      tracker.recordUsage('key-1', { latencyMs: 300 });
      expect(tracker.getAvgLatencyMs('key-1')).toBe(300);
    });

    it('average latency changes as window slides', () => {
      const tracker = new UsageTracker(60_000);

      // T=0: 100ms
      tracker.recordUsage('key-1', { latencyMs: 100 });
      expect(tracker.getAvgLatencyMs('key-1')).toBe(100);

      // T=30s: 300ms -> avg 200
      vi.advanceTimersByTime(30_000);
      tracker.recordUsage('key-1', { latencyMs: 300 });
      expect(tracker.getAvgLatencyMs('key-1')).toBe(200);

      // T=61s: T=0 entry pruned, only T=30s entry remains -> 300
      vi.advanceTimersByTime(31_000);
      expect(tracker.getAvgLatencyMs('key-1')).toBe(300);
    });
  });

  describe('metricsWindowMs = 0 disables rolling metrics', () => {
    it('getErrorRate returns 0', () => {
      const tracker = new UsageTracker(0);
      tracker.recordRequest('key-1');
      tracker.recordError('key-1');

      expect(tracker.getErrorRate('key-1')).toBe(0);
    });

    it('getAvgLatencyMs returns 0', () => {
      const tracker = new UsageTracker(0);
      tracker.recordUsage('key-1', { latencyMs: 100 });

      expect(tracker.getAvgLatencyMs('key-1')).toBe(0);
    });

    it('still tracks cumulative metrics', () => {
      const tracker = new UsageTracker(0);
      tracker.recordRequest('key-1');
      tracker.recordUsage('key-1', { tokens: 100, cost: 0.01 });
      tracker.recordError('key-1');
      tracker.recordRateLimit('key-1');

      const metrics = tracker.getMetrics('key-1');
      expect(metrics.requests).toBe(1);
      expect(metrics.tokens).toBe(100);
      expect(metrics.cost).toBeCloseTo(0.01);
      expect(metrics.errors).toBe(1);
      expect(metrics.rateLimits).toBe(1);
    });
  });

  describe('getMetrics', () => {
    it('returns complete shape with all fields', () => {
      const tracker = new UsageTracker();
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
      expect(metrics).toEqual(expect.objectContaining({
        requests: 1,
        tokens: 500,
        inputTokens: 300,
        outputTokens: 200,
        errors: 1,
        rateLimits: 1,
        cost: expect.closeTo(0.05),
        lastUsedAt: expect.any(String),
        lastErrorAt: expect.any(String),
        errorRate: expect.any(Number),
        avgLatencyMs: expect.any(Number),
      }));
    });

    it('returns zero/null defaults for uninitialized key', () => {
      const tracker = new UsageTracker();
      const metrics = tracker.getMetrics('new-key');

      expect(metrics.requests).toBe(0);
      expect(metrics.tokens).toBe(0);
      expect(metrics.inputTokens).toBe(0);
      expect(metrics.outputTokens).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.rateLimits).toBe(0);
      expect(metrics.cost).toBe(0);
      expect(metrics.lastUsedAt).toBeNull();
      expect(metrics.lastErrorAt).toBeNull();
      expect(metrics.errorRate).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
    });
  });

  describe('multiple keys tracked independently', () => {
    it('tracks separate metrics per key', () => {
      const tracker = new UsageTracker();

      tracker.recordRequest('key-1');
      tracker.recordRequest('key-1');
      tracker.recordUsage('key-1', { tokens: 100 });
      tracker.recordError('key-1');

      tracker.recordRequest('key-2');
      tracker.recordUsage('key-2', { tokens: 500 });
      tracker.recordRateLimit('key-2');

      const m1 = tracker.getMetrics('key-1');
      expect(m1.requests).toBe(2);
      expect(m1.tokens).toBe(100);
      expect(m1.errors).toBe(1);
      expect(m1.rateLimits).toBe(0);

      const m2 = tracker.getMetrics('key-2');
      expect(m2.requests).toBe(1);
      expect(m2.tokens).toBe(500);
      expect(m2.errors).toBe(0);
      expect(m2.rateLimits).toBe(1);
    });

    it('error rates are independent per key', () => {
      const tracker = new UsageTracker(60_000);

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

      expect(tracker.getErrorRate('key-1')).toBe(1.0);
      expect(tracker.getErrorRate('key-2')).toBe(0);
    });

    it('latency averages are independent per key', () => {
      const tracker = new UsageTracker(60_000);

      tracker.recordUsage('key-1', { latencyMs: 100 });
      tracker.recordUsage('key-1', { latencyMs: 200 });

      tracker.recordUsage('key-2', { latencyMs: 500 });

      expect(tracker.getAvgLatencyMs('key-1')).toBe(150);
      expect(tracker.getAvgLatencyMs('key-2')).toBe(500);
    });
  });
});
