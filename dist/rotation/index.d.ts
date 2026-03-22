import type { RotationStrategy } from '../types';
import type { RotationStrategyImpl } from './types';
export declare function createRotationStrategy(strategy: RotationStrategy): RotationStrategyImpl;
export type { RotationStrategyImpl } from './types';
export { RoundRobinStrategy } from './round-robin';
export { LeastRecentlyUsedStrategy } from './lru';
export { LeastRequestsStrategy } from './least-requests';
export { WeightedRandomStrategy } from './weighted-random';
export { PriorityStrategy } from './priority';
//# sourceMappingURL=index.d.ts.map