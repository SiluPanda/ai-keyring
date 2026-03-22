/**
 * Manages per-key cooldown state with escalating backoff.
 *
 * Cooldowns are evaluated lazily: no timers are used. Instead,
 * `isInCooldown` compares `Date.now()` against a stored end timestamp
 * and cleans up expired entries on access.
 */
export declare class CooldownManager {
    private readonly defaultCooldownMs;
    private readonly maxCooldownMs;
    private readonly cooldownEscalationWindowMs;
    /** Map of keyId -> cooldown end timestamp (ms) */
    private cooldowns;
    /** Map of keyId -> total accumulated cooldown ms */
    private totalCooldownMs;
    /** Map of keyId -> consecutive 429 count for escalation */
    private consecutiveRateLimits;
    /** Map of keyId -> timestamp of last rate limit for escalation window */
    private lastRateLimitAt;
    constructor(defaultCooldownMs?: number, maxCooldownMs?: number, cooldownEscalationWindowMs?: number);
    /**
     * Place a key in cooldown for the given duration.
     * Enforces a minimum of 1s and caps at maxCooldownMs.
     */
    setCooldown(keyId: string, durationMs: number): void;
    /**
     * Check whether a key is currently in cooldown.
     * Lazily cleans up expired entries.
     */
    isInCooldown(keyId: string): boolean;
    /**
     * Get the remaining cooldown time in milliseconds for a key.
     * Returns 0 if the key is not in cooldown.
     */
    getCooldownRemainingMs(keyId: string): number;
    /** Remove a key from cooldown immediately. */
    clearCooldown(keyId: string): void;
    /** Get the total accumulated cooldown time for a key. */
    getTotalCooldownMs(keyId: string): number;
    /**
     * Record a rate limit hit and compute escalated cooldown duration.
     * Returns the cooldown duration to apply.
     *
     * If `retryAfterMs` is provided (from a Retry-After header), it is
     * used directly without escalation. Otherwise, the default cooldown
     * is multiplied by an escalation factor: 1x, 2x, 4x, 8x (capped).
     *
     * Escalation resets if the time since the last rate limit exceeds
     * `cooldownEscalationWindowMs`.
     */
    recordRateLimit(keyId: string, retryAfterMs?: number): number;
    /**
     * Reset escalation counter for a key (called on successful usage).
     */
    resetEscalation(keyId: string): void;
    /** Get the current escalation level for a key. */
    getEscalationLevel(keyId: string): number;
    /**
     * Get the cooldown end timestamp for a key, or null if not in cooldown.
     */
    getCooldownEndsAt(keyId: string): Date | null;
}
//# sourceMappingURL=cooldown.d.ts.map