"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.minimalKey = exports.keyWithExpiry = exports.taggedKeys = exports.priorityKeys = exports.weightedKeys = exports.anthropicKey1 = exports.openAiKey2 = exports.openAiKey1 = void 0;
exports.openAiKey1 = {
    id: 'oai-1',
    key: 'sk-test-1',
    provider: 'openai',
    weight: 1,
    priority: 0,
};
exports.openAiKey2 = {
    id: 'oai-2',
    key: 'sk-test-2',
    provider: 'openai',
    weight: 2,
    priority: 1,
};
exports.anthropicKey1 = {
    id: 'ant-1',
    key: 'sk-ant-test-1',
    provider: 'anthropic',
    weight: 1,
    priority: 0,
};
exports.weightedKeys = [
    { id: 'w-1', key: 'sk-weighted-1', provider: 'openai', weight: 1 },
    { id: 'w-2', key: 'sk-weighted-2', provider: 'openai', weight: 3 },
    { id: 'w-3', key: 'sk-weighted-3', provider: 'openai', weight: 5 },
];
exports.priorityKeys = [
    { id: 'p-1', key: 'sk-priority-1', provider: 'openai', priority: 0 },
    { id: 'p-2', key: 'sk-priority-2', provider: 'openai', priority: 1 },
    { id: 'p-3', key: 'sk-priority-3', provider: 'openai', priority: 2 },
];
exports.taggedKeys = [
    { id: 't-1', key: 'sk-tagged-1', provider: 'openai', tags: ['premium'] },
    { id: 't-2', key: 'sk-tagged-2', provider: 'openai', tags: ['standard'] },
    { id: 't-3', key: 'sk-tagged-3', provider: 'openai', tags: ['fallback'] },
];
exports.keyWithExpiry = {
    id: 'exp-1',
    key: 'sk-expiry-1',
    provider: 'openai',
    metadata: {
        expiresAt: new Date(Date.now() + 86400000),
    },
};
exports.minimalKey = {
    key: 'sk-minimal',
    provider: 'openai',
};
//# sourceMappingURL=mock-keys.js.map