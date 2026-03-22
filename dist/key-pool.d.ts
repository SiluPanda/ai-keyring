import type { KeyConfig, KeyEntry } from './types';
export interface InternalKeyEntry extends KeyEntry {
    disabled: boolean;
    weight: number;
    priority: number;
}
export declare class KeyPool {
    private keys;
    private byProvider;
    private byTag;
    addKey(config: KeyConfig): InternalKeyEntry;
    removeKey(keyId: string): void;
    getKey(keyId: string): InternalKeyEntry | undefined;
    getAllKeys(): InternalKeyEntry[];
    getKeysByProvider(provider: string): InternalKeyEntry[];
    getKeysByTag(tag: string): InternalKeyEntry[];
    getAvailableKeys(options?: {
        provider?: string;
        tag?: string;
    }): InternalKeyEntry[];
    size(): number;
}
//# sourceMappingURL=key-pool.d.ts.map