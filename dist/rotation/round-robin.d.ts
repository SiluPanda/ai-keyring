import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';
export declare class RoundRobinStrategy implements RotationStrategyImpl {
    private counter;
    select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null;
}
//# sourceMappingURL=round-robin.d.ts.map