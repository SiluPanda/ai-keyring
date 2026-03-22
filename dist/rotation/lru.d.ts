import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';
export declare class LeastRecentlyUsedStrategy implements RotationStrategyImpl {
    private lastUsed;
    select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null;
}
//# sourceMappingURL=lru.d.ts.map