import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';

export class LeastRequestsStrategy implements RotationStrategyImpl {
  private requests = new Map<string, number>();

  select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null {
    if (availableKeys.length === 0) return null;
    let fewest: InternalKeyEntry | null = null;
    let fewestCount = Infinity;
    for (const key of availableKeys) {
      const count = this.requests.get(key.id) ?? 0;
      if (count < fewestCount) {
        fewestCount = count;
        fewest = key;
      }
    }
    if (fewest) this.requests.set(fewest.id, (this.requests.get(fewest.id) ?? 0) + 1);
    return fewest;
  }
}
