import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';

export class LeastRecentlyUsedStrategy implements RotationStrategyImpl {
  private lastUsed = new Map<string, number>();

  select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null {
    if (availableKeys.length === 0) return null;
    let oldest: InternalKeyEntry | null = null;
    let oldestTime = Infinity;
    for (const key of availableKeys) {
      const time = this.lastUsed.get(key.id) ?? 0;
      if (time < oldestTime) {
        oldestTime = time;
        oldest = key;
      }
    }
    if (oldest) this.lastUsed.set(oldest.id, Date.now());
    return oldest;
  }
}
