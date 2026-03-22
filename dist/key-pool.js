"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyPool = void 0;
const node_crypto_1 = require("node:crypto");
class KeyPool {
    keys = new Map();
    byProvider = new Map(); // provider -> keyIds
    byTag = new Map(); // tag -> keyIds
    addKey(config) {
        if (!config.key)
            throw new TypeError('key must be a non-empty string');
        if (!config.provider)
            throw new TypeError('provider must be a non-empty string');
        const id = config.id || (0, node_crypto_1.randomUUID)();
        if (this.keys.has(id))
            throw new TypeError(`Duplicate key id: "${id}"`);
        const entry = {
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
    removeKey(keyId) {
        const entry = this.keys.get(keyId);
        if (!entry)
            return;
        this.keys.delete(keyId);
        // Remove from provider group
        const providerList = this.byProvider.get(entry.provider);
        if (providerList) {
            const idx = providerList.indexOf(keyId);
            if (idx !== -1)
                providerList.splice(idx, 1);
            if (providerList.length === 0)
                this.byProvider.delete(entry.provider);
        }
        // Remove from tag groups
        for (const tag of entry.tags) {
            const tagList = this.byTag.get(tag);
            if (tagList) {
                const idx = tagList.indexOf(keyId);
                if (idx !== -1)
                    tagList.splice(idx, 1);
                if (tagList.length === 0)
                    this.byTag.delete(tag);
            }
        }
    }
    getKey(keyId) {
        return this.keys.get(keyId);
    }
    getAllKeys() {
        return [...this.keys.values()];
    }
    getKeysByProvider(provider) {
        const ids = this.byProvider.get(provider) || [];
        return ids.map(id => this.keys.get(id)).filter(Boolean);
    }
    getKeysByTag(tag) {
        const ids = this.byTag.get(tag) || [];
        return ids.map(id => this.keys.get(id)).filter(Boolean);
    }
    getAvailableKeys(options) {
        let keys;
        if (options?.provider) {
            keys = this.getKeysByProvider(options.provider);
        }
        else if (options?.tag) {
            keys = this.getKeysByTag(options.tag);
        }
        else {
            keys = this.getAllKeys();
        }
        return keys.filter(k => {
            if (k.disabled)
                return false;
            // Check expiration
            if (k.metadata?.expiresAt) {
                const expiresAt = typeof k.metadata.expiresAt === 'string'
                    ? new Date(k.metadata.expiresAt).getTime()
                    : k.metadata.expiresAt;
                if (Date.now() >= expiresAt) {
                    k.disabled = true;
                    return false;
                }
            }
            return true;
        });
    }
    size() {
        return this.keys.size;
    }
}
exports.KeyPool = KeyPool;
//# sourceMappingURL=key-pool.js.map