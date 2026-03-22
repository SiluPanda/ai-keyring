/** Configuration for a single key. */
export interface KeyConfig {
    /** Unique identifier. Auto-generated if not provided. */
    id?: string;
    /** The actual API key string. Required. */
    key: string;
    /** Provider name (e.g., 'openai', 'anthropic'). Required. */
    provider: string;
    /** Optional tags for additional pool membership. */
    tags?: string[];
    /** Weight for weighted-random rotation. Default: 1. */
    weight?: number;
    /** Priority for priority-based rotation. Lower = higher priority. Default: 0. */
    priority?: number;
    /** Rate limit hint: maximum requests per minute for this key. */
    maxRequestsPerMinute?: number;
    /** Arbitrary metadata. Stored and returned in stats, not interpreted. */
    metadata?: Record<string, unknown>;
}
/** Rotation strategy identifier. */
export type RotationStrategy = 'round-robin' | 'least-recently-used' | 'least-requests' | 'weighted-random' | 'priority';
/** A key entry returned by getKey(). */
export interface KeyEntry {
    /** Unique identifier for this key. */
    id: string;
    /** The actual API key string. */
    key: string;
    /** The provider this key belongs to. */
    provider: string;
    /** Tags for additional pool membership. */
    tags: string[];
    /** Caller-provided metadata. */
    metadata?: Record<string, unknown>;
}
/** Per-pool configuration overrides. */
export interface PoolConfig {
    /** Override the global rotation strategy for this pool. */
    strategy?: RotationStrategy;
    /** Fallback pool name when this pool is exhausted. */
    fallbackPool?: string;
}
/** Per-pool aggregate statistics. */
export interface PoolState {
    totalKeys: number;
    availableKeys: number;
    cooldownKeys: number;
    disabledKeys: number;
    totalRequests: number;
    totalTokens: number;
    totalErrors: number;
}
/** Throw a PoolExhaustedError. */
export interface ThrowExhaustion {
    strategy: 'throw';
}
/** Wait for a key to exit cooldown. */
export interface WaitExhaustion {
    strategy: 'wait';
    /** Maximum wait time in milliseconds. Default: 30000. */
    maxWaitMs?: number;
}
/** Invoke a fallback function. */
export interface FallbackExhaustion {
    strategy: 'fallback';
    /** The fallback function. Receives the pool name and pool state. */
    fn: (pool: string, state: PoolState) => Promise<KeyEntry>;
}
export type PoolExhaustionConfig = ThrowExhaustion | WaitExhaustion | FallbackExhaustion;
/** Health check result returned by the caller's health check function. */
export interface HealthCheckResult {
    /** Whether the key is healthy. */
    healthy: boolean;
    /** Error message if unhealthy. */
    error?: string;
    /** Probe latency in milliseconds. */
    latencyMs?: number;
    /** Remaining quota (tokens, requests, or other unit). */
    remainingQuota?: number;
    /** ISO 8601 timestamp when quota resets. */
    quotaResetsAt?: string;
}
/** Per-provider health check function. */
export type HealthCheckFn = (key: string) => Promise<HealthCheckResult>;
/** Health check configuration. */
export interface HealthCheckConfig {
    /** Per-provider health check functions. */
    [provider: string]: HealthCheckFn | number | ((keyId: string, error: string) => void) | undefined;
    /** Interval in milliseconds for periodic health checks. 0 or undefined disables periodic checks. */
    intervalMs?: number;
    /** Number of consecutive failures before disabling a key. Default: 1. */
    unhealthyThreshold?: number;
    /** Callback when a key is determined unhealthy. */
    onUnhealthy?: (keyId: string, error: string) => void;
}
/** Health check report for all keys. */
export interface HealthCheckReport {
    /** Overall status. */
    overall: 'healthy' | 'degraded' | 'unhealthy';
    /** Per-key results. */
    keys: Array<{
        id: string;
        provider: string;
        healthy: boolean;
        error?: string;
        latencyMs?: number;
        remainingQuota?: number;
        quotaResetsAt?: string;
    }>;
    /** ISO 8601 timestamp of when the check ran. */
    checkedAt: string;
    /** Total duration of the health check in milliseconds. */
    durationMs: number;
}
/** Usage report for a single request. */
export interface UsageReport {
    /** Total tokens consumed. */
    tokens?: number;
    /** Input/prompt tokens. */
    inputTokens?: number;
    /** Output/completion tokens. */
    outputTokens?: number;
    /** Request latency in milliseconds. */
    latencyMs?: number;
    /** Dollar cost of the request. */
    cost?: number;
}
/** Per-key usage statistics. */
export interface KeyStats {
    id: string;
    provider: string;
    requests: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    errors: number;
    rateLimits: number;
    errorRate: number;
    avgLatencyMs: number;
    lastUsedAt: string | null;
    lastErrorAt: string | null;
    cooldownEndsAt: string | null;
    totalCooldownMs: number;
    healthStatus: 'healthy' | 'unhealthy' | 'unknown';
    lastHealthCheckAt: string | null;
    cost: number;
    metadata?: Record<string, unknown>;
    status: 'available' | 'cooldown' | 'disabled';
}
/** Complete stats returned by getStats(). */
export interface KeyringStats {
    keys: Record<string, KeyStats>;
    pools: Record<string, PoolState>;
}
/** Serializable state for persistence. Does not include key strings. */
export interface ExportedKeyringState {
    keys: Record<string, {
        requests: number;
        tokens: number;
        inputTokens: number;
        outputTokens: number;
        errors: number;
        rateLimits: number;
        cost: number;
        totalCooldownMs: number;
        cooldownEndsAt: string | null;
        healthStatus: 'healthy' | 'unhealthy' | 'unknown';
        lastUsedAt: string | null;
        lastErrorAt: string | null;
        lastHealthCheckAt: string | null;
    }>;
    exportedAt: string;
}
/** Event hooks for observability. */
export interface KeyringHooks {
    /** A key entered cooldown due to a 429 response. */
    onCooldownStart?: (info: {
        keyId: string;
        provider: string;
        cooldownMs: number;
        retryAfter?: number;
        escalationLevel: number;
    }) => void;
    /** A key exited cooldown and is available again. */
    onCooldownEnd?: (info: {
        keyId: string;
        provider: string;
        cooldownDurationMs: number;
    }) => void;
    /** A key was disabled (failed health check or expired). */
    onKeyDisabled?: (info: {
        keyId: string;
        provider: string;
        reason: 'health-check' | 'expired' | 'manual';
        error?: string;
    }) => void;
    /** A disabled key was re-enabled (passed health check). */
    onKeyEnabled?: (info: {
        keyId: string;
        provider: string;
    }) => void;
    /** All keys in a pool are unavailable. */
    onPoolExhausted?: (info: {
        pool: string;
        totalKeys: number;
        cooldownKeys: number;
        disabledKeys: number;
        shortestCooldownMs: number;
    }) => void;
    /** A health check completed. */
    onHealthCheckComplete?: (info: {
        report: HealthCheckReport;
    }) => void;
    /** A key was selected by getKey(). */
    onKeyRotation?: (info: {
        keyId: string;
        provider: string;
        strategy: RotationStrategy;
        poolSize: number;
        availableKeys: number;
    }) => void;
}
/** Configuration for createKeyring. */
export interface KeyringConfig {
    /** Initial set of keys. At least one is required. */
    keys: KeyConfig[];
    /** Global rotation strategy. Default: 'round-robin'. */
    strategy?: RotationStrategy;
    /** Default cooldown duration in milliseconds when no Retry-After header is present. Default: 60000 (60s). */
    defaultCooldownMs?: number;
    /** Maximum cooldown duration in milliseconds (caps escalating cooldown). Default: 600000 (10 minutes). */
    maxCooldownMs?: number;
    /** Time window for cooldown escalation tracking. Default: 300000 (5 minutes). */
    cooldownEscalationWindowMs?: number;
    /** Pool exhaustion strategy. Default: { strategy: 'throw' }. */
    onPoolExhausted?: PoolExhaustionConfig;
    /** Per-pool configuration overrides. */
    pools?: Record<string, PoolConfig>;
    /** Health check configuration. */
    healthCheck?: HealthCheckConfig;
    /** Time window in milliseconds for rolling metrics (error rate, avg latency). Default: 300000 (5 minutes). */
    metricsWindowMs?: number;
    /** Event hooks. */
    hooks?: KeyringHooks;
    /** Previously exported state to restore. Keys are matched by id. */
    initialState?: ExportedKeyringState;
}
/** The keyring instance returned by createKeyring. */
export interface Keyring {
    /** Get the next available key from a provider pool, tag pool, or any pool. */
    getKey(provider?: string | {
        provider?: string;
        tag?: string;
    }): KeyEntry;
    /** Record usage metrics for a key. */
    reportUsage(keyId: string, usage: UsageReport): void;
    /** Report an error for a key. Handles 429 detection and cooldown. */
    reportError(keyId: string, error: unknown): void;
    /** Add a key to the keyring at runtime. */
    addKey(config: KeyConfig): void;
    /** Remove a key from the keyring at runtime. */
    removeKey(keyId: string): void;
    /** Get per-key and per-pool usage statistics. */
    getStats(): KeyringStats;
    /** Run health checks on all keys or a specific provider's keys. */
    healthCheck(provider?: string): Promise<HealthCheckReport>;
    /** Start periodic health checks (if intervalMs is configured). */
    startHealthChecks(): void;
    /** Stop periodic health checks. */
    stopHealthChecks(): void;
    /** Export state for persistence. Does not include key strings. */
    exportState(): ExportedKeyringState;
    /** Stop all timers and clean up resources. */
    shutdown(): void;
}
//# sourceMappingURL=types.d.ts.map