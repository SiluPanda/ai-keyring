import type { RotationStrategy } from '../types';
import type { RotationStrategyImpl } from './types';
import { RoundRobinStrategy } from './round-robin';
import { LeastRecentlyUsedStrategy } from './lru';
import { LeastRequestsStrategy } from './least-requests';
import { WeightedRandomStrategy } from './weighted-random';
import { PriorityStrategy } from './priority';

export function createRotationStrategy(strategy: RotationStrategy): RotationStrategyImpl {
  switch (strategy) {
    case 'round-robin': return new RoundRobinStrategy();
    case 'least-recently-used': return new LeastRecentlyUsedStrategy();
    case 'least-requests': return new LeastRequestsStrategy();
    case 'weighted-random': return new WeightedRandomStrategy();
    case 'priority': return new PriorityStrategy();
    default: throw new TypeError(`Unknown rotation strategy: ${strategy}`);
  }
}

export type { RotationStrategyImpl } from './types';
export { RoundRobinStrategy } from './round-robin';
export { LeastRecentlyUsedStrategy } from './lru';
export { LeastRequestsStrategy } from './least-requests';
export { WeightedRandomStrategy } from './weighted-random';
export { PriorityStrategy } from './priority';
