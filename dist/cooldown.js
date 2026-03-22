"use strict";
// ── Per-Key Cooldown Manager ────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.CooldownManager = void 0;
/**
 * Manages per-key cooldown state with escalating backoff.
 *
 * Cooldowns are evaluated lazily: no timers are used. Instead,
 * `isInCooldown` compares `Date.now()` against a stored end timestamp
 * and cleans up expired entries on access.
 */
class CooldownManager {
    defaultCooldownMs;
    maxCooldownMs;
    cooldownEscalationWindowMs;
    /** Map of keyId -> cooldown end timestamp (ms) */
    cooldowns = new Map();
    /** Map of keyId -> total accumulated cooldown ms */
    totalCooldownMs = new Map();
    /** Map of keyId -> consecutive 429 count for escalation */
    consecutiveRateLimits = new Map();
    /** Map of keyId -> timestamp of last rate limit for escalation window */
    lastRateLimitAt = new Map();
    constructor(defaultCooldownMs = 10000, maxCooldownMs = 300000, cooldownEscalationWindowMs = 60000) {
        this.defaultCooldownMs = defaultCooldownMs;
        this.maxCooldownMs = maxCooldownMs;
        this.cooldownEscalationWindowMs = cooldownEscalationWindowMs;
    }
    /**
     * Place a key in cooldown for the given duration.
     * Enforces a minimum of 1s and caps at maxCooldownMs.
     */
    setCooldown(keyId, durationMs) {
        const duration = Math.max(1000, Math.min(durationMs, this.maxCooldownMs));
        const endsAt = Date.now() + duration;
        this.cooldowns.set(keyId, endsAt);
        this.totalCooldownMs.set(keyId, (this.totalCooldownMs.get(keyId) || 0) + duration);
    }
    /**
     * Check whether a key is currently in cooldown.
     * Lazily cleans up expired entries.
     */
    isInCooldown(keyId) {
        const endsAt = this.cooldowns.get(keyId);
        if (!endsAt)
            return false;
        if (Date.now() >= endsAt) {
            this.cooldowns.delete(keyId);
            return false;
        }
        return true;
    }
    /**
     * Get the remaining cooldown time in milliseconds for a key.
     * Returns 0 if the key is not in cooldown.
     */
    getCooldownRemainingMs(keyId) {
        const endsAt = this.cooldowns.get(keyId);
        if (!endsAt)
            return 0;
        return Math.max(0, endsAt - Date.now());
    }
    /** Remove a key from cooldown immediately. */
    clearCooldown(keyId) {
        this.cooldowns.delete(keyId);
    }
    /** Get the total accumulated cooldown time for a key. */
    getTotalCooldownMs(keyId) {
        return this.totalCooldownMs.get(keyId) || 0;
    }
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
    recordRateLimit(keyId, retryAfterMs) {
        const now = Date.now();
        const lastHit = this.lastRateLimitAt.get(keyId) || 0;
        // Reset escalation if outside window
        if (now - lastHit > this.cooldownEscalationWindowMs) {
            this.consecutiveRateLimits.set(keyId, 0);
        }
        this.lastRateLimitAt.set(keyId, now);
        const count = (this.consecutiveRateLimits.get(keyId) || 0) + 1;
        this.consecutiveRateLimits.set(keyId, count);
        // If Retry-After is provided, use it directly (no escalation)
        if (retryAfterMs !== undefined) {
            return Math.max(1000, Math.min(retryAfterMs, this.maxCooldownMs));
        }
        // Escalation multipliers: 1x, 2x, 4x, 8x (capped at 8x)
        const multiplier = Math.min(8, Math.pow(2, Math.min(count - 1, 3)));
        return Math.min(this.defaultCooldownMs * multiplier, this.maxCooldownMs);
    }
    /**
     * Reset escalation counter for a key (called on successful usage).
     */
    resetEscalation(keyId) {
        this.consecutiveRateLimits.set(keyId, 0);
    }
    /** Get the current escalation level for a key. */
    getEscalationLevel(keyId) {
        return this.consecutiveRateLimits.get(keyId) || 0;
    }
    /**
     * Get the cooldown end timestamp for a key, or null if not in cooldown.
     */
    getCooldownEndsAt(keyId) {
        const endsAt = this.cooldowns.get(keyId);
        if (!endsAt || Date.now() >= endsAt)
            return null;
        return new Date(endsAt);
    }
}
exports.CooldownManager = CooldownManager;
//# sourceMappingURL=cooldown.js.map