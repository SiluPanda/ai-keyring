import type { UsageReport } from './types';

interface KeyMetrics {
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  errors: number;
  rateLimits: number;
  cost: number;
  lastUsedAt: string | null;
  lastErrorAt: string | null;
}

interface TimestampedEntry {
  timestamp: number;
  value: number;
}

export class UsageTracker {
  private metrics = new Map<string, KeyMetrics>();
  private errorEntries = new Map<string, TimestampedEntry[]>();
  private requestEntries = new Map<string, TimestampedEntry[]>();
  private latencyEntries = new Map<string, TimestampedEntry[]>();

  constructor(private readonly metricsWindowMs: number = 60_000) {}

  private getOrCreate(keyId: string): KeyMetrics {
    let m = this.metrics.get(keyId);
    if (!m) {
      m = {
        requests: 0,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        errors: 0,
        rateLimits: 0,
        cost: 0,
        lastUsedAt: null,
        lastErrorAt: null,
      };
      this.metrics.set(keyId, m);
    }
    return m;
  }

  recordRequest(keyId: string): void {
    const m = this.getOrCreate(keyId);
    m.requests++;
    m.lastUsedAt = new Date().toISOString();
    if (this.metricsWindowMs > 0) {
      const entries = this.requestEntries.get(keyId) || [];
      entries.push({ timestamp: Date.now(), value: 1 });
      this.requestEntries.set(keyId, entries);
    }
  }

  recordUsage(keyId: string, usage: UsageReport): void {
    const m = this.getOrCreate(keyId);
    if (usage.tokens) m.tokens += usage.tokens;
    if (usage.inputTokens) m.inputTokens += usage.inputTokens;
    if (usage.outputTokens) m.outputTokens += usage.outputTokens;
    if (usage.cost) m.cost += usage.cost;
    if (usage.latencyMs !== undefined && this.metricsWindowMs > 0) {
      const entries = this.latencyEntries.get(keyId) || [];
      entries.push({ timestamp: Date.now(), value: usage.latencyMs });
      this.latencyEntries.set(keyId, entries);
    }
  }

  recordError(keyId: string): void {
    const m = this.getOrCreate(keyId);
    m.errors++;
    m.lastErrorAt = new Date().toISOString();
    if (this.metricsWindowMs > 0) {
      const entries = this.errorEntries.get(keyId) || [];
      entries.push({ timestamp: Date.now(), value: 1 });
      this.errorEntries.set(keyId, entries);
    }
  }

  recordRateLimit(keyId: string): void {
    const m = this.getOrCreate(keyId);
    m.rateLimits++;
  }

  private pruneWindow(entries: TimestampedEntry[]): TimestampedEntry[] {
    const cutoff = Date.now() - this.metricsWindowMs;
    return entries.filter(e => e.timestamp >= cutoff);
  }

  getErrorRate(keyId: string): number {
    if (this.metricsWindowMs <= 0) return 0;
    const errors = this.pruneWindow(this.errorEntries.get(keyId) || []);
    this.errorEntries.set(keyId, errors);
    const requests = this.pruneWindow(this.requestEntries.get(keyId) || []);
    this.requestEntries.set(keyId, requests);
    if (requests.length === 0) return 0;
    return errors.length / requests.length;
  }

  getAvgLatencyMs(keyId: string): number {
    if (this.metricsWindowMs <= 0) return 0;
    const entries = this.pruneWindow(this.latencyEntries.get(keyId) || []);
    this.latencyEntries.set(keyId, entries);
    if (entries.length === 0) return 0;
    return entries.reduce((sum, e) => sum + e.value, 0) / entries.length;
  }

  getMetrics(keyId: string): KeyMetrics & { errorRate: number; avgLatencyMs: number } {
    const m = this.getOrCreate(keyId);
    return {
      ...m,
      errorRate: this.getErrorRate(keyId),
      avgLatencyMs: this.getAvgLatencyMs(keyId),
    };
  }
}
