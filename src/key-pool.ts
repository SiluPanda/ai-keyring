import { randomUUID } from 'node:crypto';
import type { KeyConfig, KeyEntry } from './types';

export interface InternalKeyEntry extends KeyEntry {
  disabled: boolean;
  weight: number;
  priority: number;
}

export class KeyPool {
  private keys = new Map<string, InternalKeyEntry>();
  private byProvider = new Map<string, string[]>(); // provider -> keyIds
  private byTag = new Map<string, string[]>(); // tag -> keyIds

  addKey(config: KeyConfig): InternalKeyEntry {
    if (!config.key) throw new TypeError('key must be a non-empty string');
    if (!config.provider) throw new TypeError('provider must be a non-empty string');

    const id = config.id || randomUUID();
    if (this.keys.has(id)) throw new TypeError(`Duplicate key id: "${id}"`);

    const entry: InternalKeyEntry = {
      id,
      key: config.key,
      provider: config.provider,
      tags: config.tags || [],
      metadata: config.metadata,
      disabled: false,
      weight: config.weight ?? 1,
      priority: config.priority ?? 0,
    };

    this.keys.set(id, entry);

    // Group by provider
    const providerList = this.byProvider.get(config.provider) || [];
    providerList.push(id);
    this.byProvider.set(config.provider, providerList);

    // Group by tags
    for (const tag of entry.tags) {
      const tagList = this.byTag.get(tag) || [];
      tagList.push(id);
      this.byTag.set(tag, tagList);
    }

    return entry;
  }

  removeKey(keyId: string): void {
    const entry = this.keys.get(keyId);
    if (!entry) return;

    this.keys.delete(keyId);

    // Remove from provider group
    const providerList = this.byProvider.get(entry.provider);
    if (providerList) {
      const idx = providerList.indexOf(keyId);
      if (idx !== -1) providerList.splice(idx, 1);
      if (providerList.length === 0) this.byProvider.delete(entry.provider);
    }

    // Remove from tag groups
    for (const tag of entry.tags) {
      const tagList = this.byTag.get(tag);
      if (tagList) {
        const idx = tagList.indexOf(keyId);
        if (idx !== -1) tagList.splice(idx, 1);
        if (tagList.length === 0) this.byTag.delete(tag);
      }
    }
  }

  getKey(keyId: string): InternalKeyEntry | undefined {
    return this.keys.get(keyId);
  }

  getAllKeys(): InternalKeyEntry[] {
    return [...this.keys.values()];
  }

  getKeysByProvider(provider: string): InternalKeyEntry[] {
    const ids = this.byProvider.get(provider) || [];
    return ids.map(id => this.keys.get(id)!).filter(Boolean);
  }

  getKeysByTag(tag: string): InternalKeyEntry[] {
    const ids = this.byTag.get(tag) || [];
    return ids.map(id => this.keys.get(id)!).filter(Boolean);
  }

  getAvailableKeys(options?: { provider?: string; tag?: string }): InternalKeyEntry[] {
    let keys: InternalKeyEntry[];
    if (options?.provider) {
      keys = this.getKeysByProvider(options.provider);
    } else if (options?.tag) {
      keys = this.getKeysByTag(options.tag);
    } else {
      keys = this.getAllKeys();
    }

    return keys.filter(k => {
      if (k.disabled) return false;
      // Check expiration
      if (k.metadata?.expiresAt) {
        const expiresAt = typeof k.metadata.expiresAt === 'string'
          ? new Date(k.metadata.expiresAt).getTime()
          : k.metadata.expiresAt as number;
        if (Date.now() >= expiresAt) {
          k.disabled = true;
          return false;
        }
      }
      return true;
    });
  }

  size(): number {
    return this.keys.size;
  }
}
