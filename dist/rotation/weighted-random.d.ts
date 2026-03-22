import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';
export declare class WeightedRandomStrategy implements RotationStrategyImpl {
    select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null;
}
//# sourceMappingURL=weighted-random.d.ts.map