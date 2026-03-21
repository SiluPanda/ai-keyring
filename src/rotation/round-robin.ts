import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';

export class RoundRobinStrategy implements RotationStrategyImpl {
  private counter = 0;

  select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null {
    if (availableKeys.length === 0) return null;
    const key = availableKeys[this.counter % availableKeys.length];
    this.counter++;
    return key;
  }
}
