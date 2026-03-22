import type { RotationStrategyImpl } from './types';
import type { InternalKeyEntry } from '../key-pool';
export declare class LeastRequestsStrategy implements RotationStrategyImpl {
    private requests;
    select(availableKeys: InternalKeyEntry[]): InternalKeyEntry | null;
}
//# sourceMappingURL=least-requests.d.ts.map