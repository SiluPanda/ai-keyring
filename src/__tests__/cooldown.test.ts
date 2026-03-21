import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CooldownManager } from '../cooldown';

describe('CooldownManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setCooldown / isInCooldown', () => {
    it('places a key in cooldown', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 5000);
      expect(mgr.isInCooldown('key-1')).toBe(true);
    });

    it('returns false for a key not in cooldown', () => {
      const mgr = new CooldownManager();
      expect(mgr.isInCooldown('key-1')).toBe(false);
    });

    it('returns true during cooldown and false after expiry', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 5000);

      // During cooldown
      vi.advanceTimersByTime(3000);
      expect(mgr.isInCooldown('key-1')).toBe(true);

      // After cooldown expires
      vi.advanceTimersByTime(2000);
      expect(mgr.isInCooldown('key-1')).toBe(false);
    });

    it('enforces minimum cooldown of 1 second', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 100); // less than 1s

      // Should still be in cooldown at 500ms
      vi.advanceTimersByTime(500);
      expect(mgr.isInCooldown('key-1')).toBe(true);

      // Should expire at 1000ms
      vi.advanceTimersByTime(500);
      expect(mgr.isInCooldown('key-1')).toBe(false);
    });

    it('caps cooldown at maxCooldownMs', () => {
      const mgr = new CooldownManager(10000, 5000); // max 5s
      mgr.setCooldown('key-1', 10000); // request 10s

      // Should still be in cooldown at 4s
      vi.advanceTimersByTime(4000);
      expect(mgr.isInCooldown('key-1')).toBe(true);

      // Should expire at 5s (capped)
      vi.advanceTimersByTime(1000);
      expect(mgr.isInCooldown('key-1')).toBe(false);
    });
  });

  describe('getCooldownRemainingMs', () => {
    it('returns correct remaining time', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 10000);

      vi.advanceTimersByTime(3000);
      expect(mgr.getCooldownRemainingMs('key-1')).toBe(7000);
    });

    it('returns 0 for a key not in cooldown', () => {
      const mgr = new CooldownManager();
      expect(mgr.getCooldownRemainingMs('key-1')).toBe(0);
    });

    it('returns 0 after cooldown expires', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 5000);

      vi.advanceTimersByTime(5000);
      expect(mgr.getCooldownRemainingMs('key-1')).toBe(0);
    });
  });

  describe('clearCooldown', () => {
    it('removes cooldown from a key', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 10000);
      expect(mgr.isInCooldown('key-1')).toBe(true);

      mgr.clearCooldown('key-1');
      expect(mgr.isInCooldown('key-1')).toBe(false);
    });

    it('is a no-op for a key not in cooldown', () => {
      const mgr = new CooldownManager();
      mgr.clearCooldown('key-1'); // should not throw
      expect(mgr.isInCooldown('key-1')).toBe(false);
    });
  });

  describe('getTotalCooldownMs', () => {
    it('returns 0 for a key with no cooldown history', () => {
      const mgr = new CooldownManager();
      expect(mgr.getTotalCooldownMs('key-1')).toBe(0);
    });

    it('accumulates across multiple cooldowns', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 5000);

      vi.advanceTimersByTime(5000);
      mgr.setCooldown('key-1', 3000);

      vi.advanceTimersByTime(3000);
      mgr.setCooldown('key-1', 2000);

      expect(mgr.getTotalCooldownMs('key-1')).toBe(10000);
    });

    it('tracks separately per key', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 5000);
      mgr.setCooldown('key-2', 3000);

      expect(mgr.getTotalCooldownMs('key-1')).toBe(5000);
      expect(mgr.getTotalCooldownMs('key-2')).toBe(3000);
    });
  });

  describe('recordRateLimit — escalation without retryAfter', () => {
    it('returns 1x defaultCooldownMs on first hit', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(10000); // 1x
    });

    it('returns 2x defaultCooldownMs on second consecutive hit', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      mgr.recordRateLimit('key-1');
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(20000); // 2x
    });

    it('returns 4x defaultCooldownMs on third consecutive hit', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      mgr.recordRateLimit('key-1');
      mgr.recordRateLimit('key-1');
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(40000); // 4x
    });

    it('caps at 8x defaultCooldownMs on fourth and subsequent hits', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      mgr.recordRateLimit('key-1');
      mgr.recordRateLimit('key-1');
      mgr.recordRateLimit('key-1');
      const fourth = mgr.recordRateLimit('key-1');
      expect(fourth).toBe(80000); // 8x

      const fifth = mgr.recordRateLimit('key-1');
      expect(fifth).toBe(80000); // still 8x, capped
    });

    it('caps escalated duration at maxCooldownMs', () => {
      const mgr = new CooldownManager(50000, 100000, 60000);
      mgr.recordRateLimit('key-1');
      mgr.recordRateLimit('key-1');
      // 3rd hit: 4x * 50000 = 200000, but maxCooldownMs = 100000
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(100000);
    });
  });

  describe('recordRateLimit — with retryAfterMs', () => {
    it('uses provided retryAfterMs directly', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      const duration = mgr.recordRateLimit('key-1', 25000);
      expect(duration).toBe(25000);
    });

    it('enforces minimum 1 second for retryAfterMs of 0', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      const duration = mgr.recordRateLimit('key-1', 0);
      expect(duration).toBe(1000);
    });

    it('enforces minimum 1 second for retryAfterMs less than 1000', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      const duration = mgr.recordRateLimit('key-1', 500);
      expect(duration).toBe(1000);
    });

    it('caps large retryAfterMs at maxCooldownMs', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      const duration = mgr.recordRateLimit('key-1', 500000);
      expect(duration).toBe(300000);
    });

    it('does not apply escalation when retryAfterMs is provided', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      // First hit without retryAfter (starts escalation)
      mgr.recordRateLimit('key-1');

      // Second hit with retryAfter — should use retryAfter directly
      const duration = mgr.recordRateLimit('key-1', 15000);
      expect(duration).toBe(15000);
    });
  });

  describe('resetEscalation', () => {
    it('resets the consecutive rate limit counter', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      mgr.recordRateLimit('key-1'); // 1x
      mgr.recordRateLimit('key-1'); // 2x

      mgr.resetEscalation('key-1');

      // Next hit should be back to 1x
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(10000);
    });

    it('is a no-op for a key with no rate limit history', () => {
      const mgr = new CooldownManager();
      mgr.resetEscalation('key-1'); // should not throw
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(10000);
    });
  });

  describe('escalation window reset', () => {
    it('resets escalation after cooldownEscalationWindowMs elapses', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      mgr.recordRateLimit('key-1'); // 1x
      mgr.recordRateLimit('key-1'); // 2x

      // Advance past the escalation window
      vi.advanceTimersByTime(61000);

      // Should reset to 1x because window has elapsed
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(10000);
    });

    it('does not reset escalation within the window', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      mgr.recordRateLimit('key-1'); // 1x

      // Advance within the window
      vi.advanceTimersByTime(30000);

      // Should still be 2x
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(20000);
    });
  });

  describe('getCooldownEndsAt', () => {
    it('returns a Date when key is in cooldown', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 10000);

      const endsAt = mgr.getCooldownEndsAt('key-1');
      expect(endsAt).toBeInstanceOf(Date);
      expect(endsAt!.getTime()).toBe(Date.now() + 10000);
    });

    it('returns null for a key not in cooldown', () => {
      const mgr = new CooldownManager();
      expect(mgr.getCooldownEndsAt('key-1')).toBeNull();
    });

    it('returns null after cooldown expires', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 5000);

      vi.advanceTimersByTime(5000);
      expect(mgr.getCooldownEndsAt('key-1')).toBeNull();
    });

    it('returns correct Date as time progresses', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 10000);
      const expectedEnd = Date.now() + 10000;

      vi.advanceTimersByTime(3000);
      const endsAt = mgr.getCooldownEndsAt('key-1');
      expect(endsAt).toBeInstanceOf(Date);
      expect(endsAt!.getTime()).toBe(expectedEnd);
    });
  });

  describe('multiple keys', () => {
    it('tracks cooldowns independently per key', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 5000);
      mgr.setCooldown('key-2', 10000);

      vi.advanceTimersByTime(5000);
      expect(mgr.isInCooldown('key-1')).toBe(false);
      expect(mgr.isInCooldown('key-2')).toBe(true);

      vi.advanceTimersByTime(5000);
      expect(mgr.isInCooldown('key-2')).toBe(false);
    });

    it('tracks escalation independently per key', () => {
      const mgr = new CooldownManager(10000, 300000, 60000);
      mgr.recordRateLimit('key-1'); // key-1: 1x
      mgr.recordRateLimit('key-1'); // key-1: 2x

      // key-2 should still start at 1x
      const duration = mgr.recordRateLimit('key-2');
      expect(duration).toBe(10000);
    });
  });

  describe('default constructor values', () => {
    it('uses default values when no arguments provided', () => {
      const mgr = new CooldownManager();

      // defaultCooldownMs = 10000
      const duration = mgr.recordRateLimit('key-1');
      expect(duration).toBe(10000);
    });

    it('maxCooldownMs defaults to 300000', () => {
      const mgr = new CooldownManager();
      mgr.setCooldown('key-1', 500000); // request 500s

      // Should be capped at 300000ms = 300s
      vi.advanceTimersByTime(299000);
      expect(mgr.isInCooldown('key-1')).toBe(true);

      vi.advanceTimersByTime(1000);
      expect(mgr.isInCooldown('key-1')).toBe(false);
    });
  });
});
