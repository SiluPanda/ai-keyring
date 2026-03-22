"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cooldown_1 = require("../cooldown");
(0, vitest_1.describe)('CooldownManager', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.describe)('setCooldown / isInCooldown', () => {
        (0, vitest_1.it)('places a key in cooldown', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 5000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(true);
        });
        (0, vitest_1.it)('returns false for a key not in cooldown', () => {
            const mgr = new cooldown_1.CooldownManager();
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(false);
        });
        (0, vitest_1.it)('returns true during cooldown and false after expiry', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 5000);
            // During cooldown
            vitest_1.vi.advanceTimersByTime(3000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(true);
            // After cooldown expires
            vitest_1.vi.advanceTimersByTime(2000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(false);
        });
        (0, vitest_1.it)('enforces minimum cooldown of 1 second', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 100); // less than 1s
            // Should still be in cooldown at 500ms
            vitest_1.vi.advanceTimersByTime(500);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(true);
            // Should expire at 1000ms
            vitest_1.vi.advanceTimersByTime(500);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(false);
        });
        (0, vitest_1.it)('caps cooldown at maxCooldownMs', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 5000); // max 5s
            mgr.setCooldown('key-1', 10000); // request 10s
            // Should still be in cooldown at 4s
            vitest_1.vi.advanceTimersByTime(4000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(true);
            // Should expire at 5s (capped)
            vitest_1.vi.advanceTimersByTime(1000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(false);
        });
    });
    (0, vitest_1.describe)('getCooldownRemainingMs', () => {
        (0, vitest_1.it)('returns correct remaining time', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 10000);
            vitest_1.vi.advanceTimersByTime(3000);
            (0, vitest_1.expect)(mgr.getCooldownRemainingMs('key-1')).toBe(7000);
        });
        (0, vitest_1.it)('returns 0 for a key not in cooldown', () => {
            const mgr = new cooldown_1.CooldownManager();
            (0, vitest_1.expect)(mgr.getCooldownRemainingMs('key-1')).toBe(0);
        });
        (0, vitest_1.it)('returns 0 after cooldown expires', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 5000);
            vitest_1.vi.advanceTimersByTime(5000);
            (0, vitest_1.expect)(mgr.getCooldownRemainingMs('key-1')).toBe(0);
        });
    });
    (0, vitest_1.describe)('clearCooldown', () => {
        (0, vitest_1.it)('removes cooldown from a key', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 10000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(true);
            mgr.clearCooldown('key-1');
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(false);
        });
        (0, vitest_1.it)('is a no-op for a key not in cooldown', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.clearCooldown('key-1'); // should not throw
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(false);
        });
    });
    (0, vitest_1.describe)('getTotalCooldownMs', () => {
        (0, vitest_1.it)('returns 0 for a key with no cooldown history', () => {
            const mgr = new cooldown_1.CooldownManager();
            (0, vitest_1.expect)(mgr.getTotalCooldownMs('key-1')).toBe(0);
        });
        (0, vitest_1.it)('accumulates across multiple cooldowns', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 5000);
            vitest_1.vi.advanceTimersByTime(5000);
            mgr.setCooldown('key-1', 3000);
            vitest_1.vi.advanceTimersByTime(3000);
            mgr.setCooldown('key-1', 2000);
            (0, vitest_1.expect)(mgr.getTotalCooldownMs('key-1')).toBe(10000);
        });
        (0, vitest_1.it)('tracks separately per key', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 5000);
            mgr.setCooldown('key-2', 3000);
            (0, vitest_1.expect)(mgr.getTotalCooldownMs('key-1')).toBe(5000);
            (0, vitest_1.expect)(mgr.getTotalCooldownMs('key-2')).toBe(3000);
        });
    });
    (0, vitest_1.describe)('recordRateLimit — escalation without retryAfter', () => {
        (0, vitest_1.it)('returns 1x defaultCooldownMs on first hit', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(10000); // 1x
        });
        (0, vitest_1.it)('returns 2x defaultCooldownMs on second consecutive hit', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            mgr.recordRateLimit('key-1');
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(20000); // 2x
        });
        (0, vitest_1.it)('returns 4x defaultCooldownMs on third consecutive hit', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            mgr.recordRateLimit('key-1');
            mgr.recordRateLimit('key-1');
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(40000); // 4x
        });
        (0, vitest_1.it)('caps at 8x defaultCooldownMs on fourth and subsequent hits', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            mgr.recordRateLimit('key-1');
            mgr.recordRateLimit('key-1');
            mgr.recordRateLimit('key-1');
            const fourth = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(fourth).toBe(80000); // 8x
            const fifth = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(fifth).toBe(80000); // still 8x, capped
        });
        (0, vitest_1.it)('caps escalated duration at maxCooldownMs', () => {
            const mgr = new cooldown_1.CooldownManager(50000, 100000, 60000);
            mgr.recordRateLimit('key-1');
            mgr.recordRateLimit('key-1');
            // 3rd hit: 4x * 50000 = 200000, but maxCooldownMs = 100000
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(100000);
        });
    });
    (0, vitest_1.describe)('recordRateLimit — with retryAfterMs', () => {
        (0, vitest_1.it)('uses provided retryAfterMs directly', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            const duration = mgr.recordRateLimit('key-1', 25000);
            (0, vitest_1.expect)(duration).toBe(25000);
        });
        (0, vitest_1.it)('enforces minimum 1 second for retryAfterMs of 0', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            const duration = mgr.recordRateLimit('key-1', 0);
            (0, vitest_1.expect)(duration).toBe(1000);
        });
        (0, vitest_1.it)('enforces minimum 1 second for retryAfterMs less than 1000', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            const duration = mgr.recordRateLimit('key-1', 500);
            (0, vitest_1.expect)(duration).toBe(1000);
        });
        (0, vitest_1.it)('caps large retryAfterMs at maxCooldownMs', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            const duration = mgr.recordRateLimit('key-1', 500000);
            (0, vitest_1.expect)(duration).toBe(300000);
        });
        (0, vitest_1.it)('does not apply escalation when retryAfterMs is provided', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            // First hit without retryAfter (starts escalation)
            mgr.recordRateLimit('key-1');
            // Second hit with retryAfter — should use retryAfter directly
            const duration = mgr.recordRateLimit('key-1', 15000);
            (0, vitest_1.expect)(duration).toBe(15000);
        });
    });
    (0, vitest_1.describe)('resetEscalation', () => {
        (0, vitest_1.it)('resets the consecutive rate limit counter', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            mgr.recordRateLimit('key-1'); // 1x
            mgr.recordRateLimit('key-1'); // 2x
            mgr.resetEscalation('key-1');
            // Next hit should be back to 1x
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(10000);
        });
        (0, vitest_1.it)('is a no-op for a key with no rate limit history', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.resetEscalation('key-1'); // should not throw
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(10000);
        });
    });
    (0, vitest_1.describe)('escalation window reset', () => {
        (0, vitest_1.it)('resets escalation after cooldownEscalationWindowMs elapses', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            mgr.recordRateLimit('key-1'); // 1x
            mgr.recordRateLimit('key-1'); // 2x
            // Advance past the escalation window
            vitest_1.vi.advanceTimersByTime(61000);
            // Should reset to 1x because window has elapsed
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(10000);
        });
        (0, vitest_1.it)('does not reset escalation within the window', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            mgr.recordRateLimit('key-1'); // 1x
            // Advance within the window
            vitest_1.vi.advanceTimersByTime(30000);
            // Should still be 2x
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(20000);
        });
    });
    (0, vitest_1.describe)('getCooldownEndsAt', () => {
        (0, vitest_1.it)('returns a Date when key is in cooldown', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 10000);
            const endsAt = mgr.getCooldownEndsAt('key-1');
            (0, vitest_1.expect)(endsAt).toBeInstanceOf(Date);
            (0, vitest_1.expect)(endsAt.getTime()).toBe(Date.now() + 10000);
        });
        (0, vitest_1.it)('returns null for a key not in cooldown', () => {
            const mgr = new cooldown_1.CooldownManager();
            (0, vitest_1.expect)(mgr.getCooldownEndsAt('key-1')).toBeNull();
        });
        (0, vitest_1.it)('returns null after cooldown expires', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 5000);
            vitest_1.vi.advanceTimersByTime(5000);
            (0, vitest_1.expect)(mgr.getCooldownEndsAt('key-1')).toBeNull();
        });
        (0, vitest_1.it)('returns correct Date as time progresses', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 10000);
            const expectedEnd = Date.now() + 10000;
            vitest_1.vi.advanceTimersByTime(3000);
            const endsAt = mgr.getCooldownEndsAt('key-1');
            (0, vitest_1.expect)(endsAt).toBeInstanceOf(Date);
            (0, vitest_1.expect)(endsAt.getTime()).toBe(expectedEnd);
        });
    });
    (0, vitest_1.describe)('multiple keys', () => {
        (0, vitest_1.it)('tracks cooldowns independently per key', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 5000);
            mgr.setCooldown('key-2', 10000);
            vitest_1.vi.advanceTimersByTime(5000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(false);
            (0, vitest_1.expect)(mgr.isInCooldown('key-2')).toBe(true);
            vitest_1.vi.advanceTimersByTime(5000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-2')).toBe(false);
        });
        (0, vitest_1.it)('tracks escalation independently per key', () => {
            const mgr = new cooldown_1.CooldownManager(10000, 300000, 60000);
            mgr.recordRateLimit('key-1'); // key-1: 1x
            mgr.recordRateLimit('key-1'); // key-1: 2x
            // key-2 should still start at 1x
            const duration = mgr.recordRateLimit('key-2');
            (0, vitest_1.expect)(duration).toBe(10000);
        });
    });
    (0, vitest_1.describe)('default constructor values', () => {
        (0, vitest_1.it)('uses default values when no arguments provided', () => {
            const mgr = new cooldown_1.CooldownManager();
            // defaultCooldownMs = 10000
            const duration = mgr.recordRateLimit('key-1');
            (0, vitest_1.expect)(duration).toBe(10000);
        });
        (0, vitest_1.it)('maxCooldownMs defaults to 300000', () => {
            const mgr = new cooldown_1.CooldownManager();
            mgr.setCooldown('key-1', 500000); // request 500s
            // Should be capped at 300000ms = 300s
            vitest_1.vi.advanceTimersByTime(299000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(true);
            vitest_1.vi.advanceTimersByTime(1000);
            (0, vitest_1.expect)(mgr.isInCooldown('key-1')).toBe(false);
        });
    });
});
//# sourceMappingURL=cooldown.test.js.map