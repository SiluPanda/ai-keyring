import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';
export declare class PriorityStrategy implements RotationStrategyImpl {
    private counter;
    select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null;
}
//# sourceMappingURL=priority.d.ts.map