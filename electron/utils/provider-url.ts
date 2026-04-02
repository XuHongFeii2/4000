export function resolveProviderBaseUrl(type: string, baseUrl?: string): string | undefined {
  const candidate = baseUrl?.trim();
  if (!candidate) return undefined;

  const normalized = candidate.replace(/\/+$/, '');
  if (type === 'lobsterapi') {
    return normalized.replace(/\/v1$/, '') + '/v1';
  }

  return normalized;
}
