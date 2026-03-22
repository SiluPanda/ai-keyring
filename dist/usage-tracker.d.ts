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
export declare class UsageTracker {
    private readonly metricsWindowMs;
    private metrics;
    private errorEntries;
    private requestEntries;
    private latencyEntries;
    constructor(metricsWindowMs?: number);
    private getOrCreate;
    recordRequest(keyId: string): void;
    recordUsage(keyId: string, usage: UsageReport): void;
    recordError(keyId: string): void;
    recordRateLimit(keyId: string): void;
    private pruneWindow;
    getErrorRate(keyId: string): number;
    getAvgLatencyMs(keyId: string): number;
    getMetrics(keyId: string): KeyMetrics & {
        errorRate: number;
        avgLatencyMs: number;
    };
}
export {};
//# sourceMappingURL=usage-tracker.d.ts.map