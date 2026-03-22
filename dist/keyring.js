"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKeyring = createKeyring;
const key_pool_1 = require("./key-pool");
const index_1 = require("./rotation/index");
const cooldown_1 = require("./cooldown");
const usage_tracker_1 = require("./usage-tracker");
const rate_limit_detector_1 = require("./rate-limit-detector");
const pool_exhausted_error_1 = require("./pool-exhausted-error");
function createKeyring(config) {
    // Validate config
    if (!config.keys || config.keys.length === 0) {
        throw new TypeError('keys must be a non-empty array');
    }
    const globalStrategy = config.strategy ?? 'round-robin';
    const defaultCooldownMs = config.defaultCooldownMs ?? 60000;
    const maxCooldownMs = config.maxCooldownMs ?? 600000;
    const cooldownEscalationWindowMs = config.cooldownEscalationWindowMs ?? 300000;
    const metricsWindowMs = config.metricsWindowMs ?? 300000;
    const pool = new key_pool_1.KeyPool();
    const globalRotation = (0, index_1.createRotationStrategy)(globalStrategy);
    const cooldown = new cooldown_1.CooldownManager(defaultCooldownMs, maxCooldownMs, cooldownEscalationWindowMs);
    const usage = new usage_tracker_1.UsageTracker(metricsWindowMs);
    const hooks = config.hooks ?? {};
    // Per-pool rotation strategy overrides
    const poolRotations = new Map();
    if (config.pools) {
        for (const [poolName, poolConfig] of Object.entries(config.pools)) {
            if (poolConfig.strategy) {
                poolRotations.set(poolName, (0, index_1.createRotationStrategy)(poolConfig.strategy));
            }
        }
    }
    // Add initial keys
    for (const key of config.keys) {
        pool.addKey(key);
    }
    function getRotationForPool(provider) {
        if (provider && poolRotations.has(provider)) {
            return poolRotations.get(provider);
        }
        return globalRotation;
    }
    function getEffectiveStrategy(provider) {
        if (provider && config.pools?.[provider]?.strategy) {
            return config.pools[provider].strategy;
        }
        return globalStrategy;
    }
    function buildKeyStates() {
        return pool.getAllKeys().map(k => ({
            id: k.id,
            status: (k.disabled ? 'disabled' : cooldown.isInCooldown(k.id) ? 'cooldown' : 'available'),
            cooldownEndsAt: cooldown.getCooldownEndsAt(k.id) ?? undefined,
            cooldownRemainingMs: cooldown.getCooldownRemainingMs(k.id) || undefined,
        }));
    }
    const keyring = {
        getKey(providerOrOpts) {
            const opts = typeof providerOrOpts === 'string'
                ? { provider: providerOrOpts }
                : providerOrOpts;
            // Get available keys (not disabled, not expired)
            let available = pool.getAvailableKeys(opts);
            // Filter out keys in cooldown
            available = available.filter(k => !cooldown.isInCooldown(k.id));
            const poolName = opts?.provider ?? 'default';
            const rotation = getRotationForPool(opts?.provider);
            const effectiveStrategy = getEffectiveStrategy(opts?.provider);
            const allPoolKeys = opts?.provider
                ? pool.getKeysByProvider(opts.provider)
                : opts?.tag
                    ? pool.getKeysByTag(opts.tag)
                    : pool.getAllKeys();
            const selected = rotation.select(available);
            if (!selected) {
                // Pool exhausted
                const keyStates = buildKeyStates();
                const cooldownRemainings = keyStates
                    .filter(s => s.cooldownRemainingMs)
                    .map(s => s.cooldownRemainingMs);
                const shortest = cooldownRemainings.length > 0
                    ? Math.min(...cooldownRemainings)
                    : 0;
                // Fire onPoolExhausted hook
                hooks.onPoolExhausted?.({
                    pool: poolName,
                    totalKeys: allPoolKeys.length,
                    cooldownKeys: allPoolKeys.filter(k => cooldown.isInCooldown(k.id)).length,
                    disabledKeys: allPoolKeys.filter(k => k.disabled).length,
                    shortestCooldownMs: shortest,
                });
                throw new pool_exhausted_error_1.PoolExhaustedError(`All keys exhausted in pool "${poolName}"`, poolName, keyStates, shortest);
            }
            usage.recordRequest(selected.id);
            hooks.onKeyRotation?.({
                keyId: selected.id,
                provider: selected.provider,
                strategy: effectiveStrategy,
                poolSize: allPoolKeys.length,
                availableKeys: available.length,
            });
            return {
                id: selected.id,
                key: selected.key,
                provider: selected.provider,
                tags: selected.tags,
                metadata: selected.metadata,
            };
        },
        reportUsage(keyId, report) {
            const key = pool.getKey(keyId);
            if (!key)
                return;
            usage.recordUsage(keyId, report);
            cooldown.resetEscalation(keyId);
        },
        reportError(keyId, error) {
            const key = pool.getKey(keyId);
            if (!key)
                return;
            usage.recordError(keyId);
            if ((0, rate_limit_detector_1.isRateLimitError)(error)) {
                usage.recordRateLimit(keyId);
                const retryAfterMs = (0, rate_limit_detector_1.extractRetryAfterMs)(error, defaultCooldownMs);
                const duration = cooldown.recordRateLimit(keyId, retryAfterMs);
                cooldown.setCooldown(keyId, duration);
                hooks.onCooldownStart?.({
                    keyId,
                    provider: key.provider,
                    cooldownMs: duration,
                    retryAfter: retryAfterMs,
                    escalationLevel: cooldown.getEscalationLevel(keyId),
                });
            }
        },
        addKey(keyConfig) {
            pool.addKey(keyConfig);
        },
        removeKey(keyId) {
            pool.removeKey(keyId);
        },
        getStats() {
            const keys = {};
            const pools = {};
            for (const entry of pool.getAllKeys()) {
                const metrics = usage.getMetrics(entry.id);
                const inCooldown = cooldown.isInCooldown(entry.id);
                keys[entry.id] = {
                    id: entry.id,
                    provider: entry.provider,
                    requests: metrics.requests,
                    tokens: metrics.tokens,
                    inputTokens: metrics.inputTokens,
                    outputTokens: metrics.outputTokens,
                    errors: metrics.errors,
                    rateLimits: metrics.rateLimits,
                    errorRate: metrics.errorRate,
                    avgLatencyMs: metrics.avgLatencyMs,
                    cost: metrics.cost,
                    lastUsedAt: metrics.lastUsedAt,
                    lastErrorAt: metrics.lastErrorAt,
                    cooldownEndsAt: cooldown.getCooldownEndsAt(entry.id)?.toISOString() ?? null,
                    totalCooldownMs: cooldown.getTotalCooldownMs(entry.id),
                    healthStatus: 'unknown',
                    lastHealthCheckAt: null,
                    metadata: entry.metadata,
                    status: entry.disabled ? 'disabled' : inCooldown ? 'cooldown' : 'available',
                };
                // Aggregate pool stats by provider
                if (!pools[entry.provider]) {
                    pools[entry.provider] = {
                        totalKeys: 0,
                        availableKeys: 0,
                        cooldownKeys: 0,
                        disabledKeys: 0,
                        totalRequests: 0,
                        totalTokens: 0,
                        totalErrors: 0,
                    };
                }
                const p = pools[entry.provider];
                p.totalKeys++;
                if (entry.disabled) {
                    p.disabledKeys++;
                }
                else if (inCooldown) {
                    p.cooldownKeys++;
                }
                else {
                    p.availableKeys++;
                }
                p.totalRequests += metrics.requests;
                p.totalTokens += metrics.tokens;
                p.totalErrors += metrics.errors;
            }
            return { keys, pools };
        },
        async healthCheck(_provider) {
            // Stub: health checking is Phase 10
            return {
                overall: 'unknown',
                keys: [],
                checkedAt: new Date().toISOString(),
                durationMs: 0,
            };
        },
        startHealthChecks() {
            // Stub: health checking is Phase 10
        },
        stopHealthChecks() {
            // Stub: health checking is Phase 10
        },
        exportState() {
            const keysState = {};
            for (const entry of pool.getAllKeys()) {
                const metrics = usage.getMetrics(entry.id);
                keysState[entry.id] = {
                    requests: metrics.requests,
                    tokens: metrics.tokens,
                    inputTokens: metrics.inputTokens,
                    outputTokens: metrics.outputTokens,
                    errors: metrics.errors,
                    rateLimits: metrics.rateLimits,
                    cost: metrics.cost,
                    totalCooldownMs: cooldown.getTotalCooldownMs(entry.id),
                    cooldownEndsAt: cooldown.getCooldownEndsAt(entry.id)?.toISOString() ?? null,
                    healthStatus: 'unknown',
                    lastUsedAt: metrics.lastUsedAt,
                    lastErrorAt: metrics.lastErrorAt,
                    lastHealthCheckAt: null,
                };
            }
            return { keys: keysState, exportedAt: new Date().toISOString() };
        },
        shutdown() {
            // Stop any timers (health checks in Phase 10)
        },
    };
    return keyring;
}
//# sourceMappingURL=keyring.js.map