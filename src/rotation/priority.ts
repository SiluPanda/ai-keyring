import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';

export class PriorityStrategy implements RotationStrategyImpl {
  private counter = 0;

  select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null {
    if (availableKeys.length === 0) return null;
    // Sort by priority ascending (lower = higher priority)
    const sorted = [...availableKeys].sort((a, b) => a.priority - b.priority);
    const topPriority = sorted[0].priority;
    const samePriority = sorted.filter(k => k.priority === topPriority);
    const key = samePriority[this.counter % samePriority.length];
    this.counter++;
    return key;
  }
}
