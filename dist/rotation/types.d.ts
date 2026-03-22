import type { InternalKeyEntry } from '../key-pool';
export interface RotationStrategyImpl {
    select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null;
}
//# sourceMappingURL=types.d.ts.map