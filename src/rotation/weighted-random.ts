import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';

export class WeightedRandomStrategy implements RotationStrategyImpl {
  select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null {
    if (availableKeys.length === 0) return null;
    const totalWeight = availableKeys.reduce((sum, k) => sum + k.weight, 0);
    let random = Math.random() * totalWeight;
    for (const key of availableKeys) {
      random -= key.weight;
      if (random <= 0) return key;
    }
    return availableKeys[availableKeys.length - 1];
  }
}
