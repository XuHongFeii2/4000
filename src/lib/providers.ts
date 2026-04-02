/**
 * Provider Types & UI Metadata - single source of truth for the frontend.
 *
 * NOTE: When adding a new provider type, also update
 * electron/utils/provider-registry.ts (env vars, models, configs).
 */

import { providerIcons } from '@/assets/providers';

export const PROVIDER_TYPES = [
  'lobsterapi',
  'anthropic',
  'openai',
  'google',
  'openrouter',
  'ark',
  'moonshot',
  'siliconflow',
  'minimax-portal',
  'minimax-portal-cn',
  'qwen-portal',
  'ollama',
  'custom',
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const OLLAMA_PLACEHOLDER_API_KEY = 'ollama-local';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  model?: string;
  fallbackModels?: string[];
  fallbackProviderIds?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderWithKeyInfo extends ProviderConfig {
  hasKey: boolean;
  keyMasked: string | null;
}

export interface ProviderTypeInfo {
  id: ProviderType;
  name: string;
  icon: string;
  placeholder: string;
  model?: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  showBaseUrl?: boolean;
  showModelId?: boolean;
  showModelIdInDevModeOnly?: boolean;
  modelIdPlaceholder?: string;
  defaultModelId?: string;
  isOAuth?: boolean;
  supportsApiKey?: boolean;
  apiKeyUrl?: string;
}

export const PROVIDER_TYPE_INFO: ProviderTypeInfo[] = [
  { id: 'lobsterapi', name: '\u9f99\u867eAPI', icon: 'L', placeholder: 'sk-...', model: 'Custom Model', requiresApiKey: true, defaultBaseUrl: 'http://lobtalk.com:3000/v1', showBaseUrl: true, showModelId: true, modelIdPlaceholder: 'gpt-4o-mini' },
  { id: 'anthropic', name: 'Anthropic', icon: 'A', placeholder: 'sk-ant-api03-...', model: 'Claude', requiresApiKey: true, apiKeyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', icon: 'O', placeholder: 'sk-proj-...', model: 'GPT', requiresApiKey: true, apiKeyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'google', name: 'Google', icon: 'G', placeholder: 'AIza...', model: 'Gemini', requiresApiKey: true, apiKeyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'openrouter', name: 'OpenRouter', icon: 'R', placeholder: 'sk-or-v1-...', model: 'Multi-Model', requiresApiKey: true, showModelId: true, showModelIdInDevModeOnly: true, modelIdPlaceholder: 'anthropic/claude-opus-4.6', defaultModelId: 'anthropic/claude-opus-4.6', apiKeyUrl: 'https://openrouter.ai/keys' },
  { id: 'ark', name: 'ByteDance Ark', icon: 'A', placeholder: 'your-ark-api-key', model: 'Doubao', requiresApiKey: true, defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', showBaseUrl: true, showModelId: true, modelIdPlaceholder: 'ep-20260228000000-xxxxx', apiKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey' },
  { id: 'moonshot', name: 'Moonshot (CN)', icon: 'M', placeholder: 'sk-...', model: 'Kimi', requiresApiKey: true, defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultModelId: 'kimi-k2.5', apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'siliconflow', name: 'SiliconFlow (CN)', icon: 'S', placeholder: 'sk-...', model: 'Multi-Model', requiresApiKey: true, defaultBaseUrl: 'https://api.siliconflow.cn/v1', showModelId: true, showModelIdInDevModeOnly: true, modelIdPlaceholder: 'deepseek-ai/DeepSeek-V3', defaultModelId: 'deepseek-ai/DeepSeek-V3', apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'minimax-portal', name: 'MiniMax (Global)', icon: 'M', placeholder: 'sk-...', model: 'MiniMax', requiresApiKey: false, isOAuth: true, supportsApiKey: true, defaultModelId: 'MiniMax-M2.5', apiKeyUrl: 'https://intl.minimaxi.com/' },
  { id: 'minimax-portal-cn', name: 'MiniMax (CN)', icon: 'M', placeholder: 'sk-...', model: 'MiniMax', requiresApiKey: false, isOAuth: true, supportsApiKey: true, defaultModelId: 'MiniMax-M2.5', apiKeyUrl: 'https://platform.minimaxi.com/' },
  { id: 'qwen-portal', name: 'Qwen', icon: 'Q', placeholder: 'sk-...', model: 'Qwen', requiresApiKey: false, isOAuth: true, defaultModelId: 'coder-model', apiKeyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key' },
  { id: 'ollama', name: 'Ollama', icon: 'O', placeholder: 'Not required', requiresApiKey: false, defaultBaseUrl: 'http://localhost:11434/v1', showBaseUrl: true, showModelId: true, modelIdPlaceholder: 'qwen3:latest' },
  { id: 'custom', name: 'Custom', icon: 'C', placeholder: 'API key...', requiresApiKey: true, showBaseUrl: true, showModelId: true, modelIdPlaceholder: 'your-provider/model-id' },
];

export function getProviderIconUrl(type: ProviderType | string): string | undefined {
  return providerIcons[type];
}

export function shouldInvertInDark(_type: ProviderType | string): boolean {
  return true;
}

export const SETUP_PROVIDERS = PROVIDER_TYPE_INFO;

export function getProviderTypeInfo(type: ProviderType): ProviderTypeInfo | undefined {
  return PROVIDER_TYPE_INFO.find((t) => t.id === type);
}

export function shouldShowProviderModelId(
  provider: Pick<ProviderTypeInfo, 'showModelId' | 'showModelIdInDevModeOnly'> | undefined,
  devModeUnlocked: boolean
): boolean {
  if (!provider?.showModelId) return false;
  if (provider.showModelIdInDevModeOnly && !devModeUnlocked) return false;
  return true;
}

export function resolveProviderModelForSave(
  provider: Pick<ProviderTypeInfo, 'defaultModelId' | 'showModelId' | 'showModelIdInDevModeOnly'> | undefined,
  modelId: string,
  devModeUnlocked: boolean
): string | undefined {
  if (!shouldShowProviderModelId(provider, devModeUnlocked)) {
    return undefined;
  }

  const trimmedModelId = modelId.trim();
  return trimmedModelId || provider?.defaultModelId || undefined;
}

export function resolveProviderApiKeyForSave(type: ProviderType | string, apiKey: string): string | undefined {
  const trimmed = apiKey.trim();
  if (type === 'ollama') {
    return trimmed || OLLAMA_PLACEHOLDER_API_KEY;
  }
  return trimmed || undefined;
}
