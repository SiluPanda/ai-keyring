import type { KeyConfig } from '../../types';

export const openAiKey1: KeyConfig = {
  id: 'oai-1',
  key: 'sk-test-1',
  provider: 'openai',
  weight: 1,
  priority: 0,
};

export const openAiKey2: KeyConfig = {
  id: 'oai-2',
  key: 'sk-test-2',
  provider: 'openai',
  weight: 2,
  priority: 1,
};

export const anthropicKey1: KeyConfig = {
  id: 'ant-1',
  key: 'sk-ant-test-1',
  provider: 'anthropic',
  weight: 1,
  priority: 0,
};

export const weightedKeys: KeyConfig[] = [
  { id: 'w-1', key: 'sk-weighted-1', provider: 'openai', weight: 1 },
  { id: 'w-2', key: 'sk-weighted-2', provider: 'openai', weight: 3 },
  { id: 'w-3', key: 'sk-weighted-3', provider: 'openai', weight: 5 },
];

export const priorityKeys: KeyConfig[] = [
  { id: 'p-1', key: 'sk-priority-1', provider: 'openai', priority: 0 },
  { id: 'p-2', key: 'sk-priority-2', provider: 'openai', priority: 1 },
  { id: 'p-3', key: 'sk-priority-3', provider: 'openai', priority: 2 },
];

export const taggedKeys: KeyConfig[] = [
  { id: 't-1', key: 'sk-tagged-1', provider: 'openai', tags: ['premium'] },
  { id: 't-2', key: 'sk-tagged-2', provider: 'openai', tags: ['standard'] },
  { id: 't-3', key: 'sk-tagged-3', provider: 'openai', tags: ['fallback'] },
];

export const keyWithExpiry: KeyConfig = {
  id: 'exp-1',
  key: 'sk-expiry-1',
  provider: 'openai',
  metadata: {
    expiresAt: new Date(Date.now() + 86400000),
  },
};

export const minimalKey: KeyConfig = {
  key: 'sk-minimal',
  provider: 'openai',
};
