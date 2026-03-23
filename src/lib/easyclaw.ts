const DEFAULT_EASYCLAW_SERVER_URL = 'http://app.easyclaw.bar';

export function normalizeEasyClawAvatarUrl(
  avatarUrl?: string | null,
  serverUrl = DEFAULT_EASYCLAW_SERVER_URL,
): string {
  const value = String(avatarUrl ?? '').trim();
  if (!value) {
    return '';
  }

  if (/^(data|blob|file|app):/i.test(value)) {
    return value;
  }

  try {
    return new URL(value, serverUrl).toString();
  } catch {
    return value;
  }
}

export { DEFAULT_EASYCLAW_SERVER_URL };
