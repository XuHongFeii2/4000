export const APP_NAME_ZH = import.meta.env.VITE_APP_NAME_ZH ?? 'easyclaw';
export const APP_NAME_EN = import.meta.env.VITE_APP_NAME_EN ?? 'easyclaw';
export const APP_NAME_JA = import.meta.env.VITE_APP_NAME_JA ?? 'easyclaw';
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://easyclaw.bar:5000';

export function appNameForLocale(locale?: string): string {
  const lang = (locale || 'en').split('-')[0];
  if (lang === 'zh') return APP_NAME_ZH;
  if (lang === 'ja') return APP_NAME_JA;
  return APP_NAME_EN;
}

