export const APP_NAME_ZH = import.meta.env.VITE_APP_NAME_ZH ?? '逻辑工坊';
export const APP_NAME_EN = import.meta.env.VITE_APP_NAME_EN ?? 'LogicFactory';
export const APP_NAME_JA = import.meta.env.VITE_APP_NAME_JA ?? 'LogicFactory';

export function appNameForLocale(locale?: string): string {
  const lang = (locale || 'en').split('-')[0];
  if (lang === 'zh') return APP_NAME_ZH;
  if (lang === 'ja') return APP_NAME_JA;
  return APP_NAME_EN;
}

