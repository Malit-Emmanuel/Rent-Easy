'use client';
import { createContext, useContext, useMemo } from 'react';
import { Lang, translate } from '@/lib/i18n';

const Ctx = createContext<{ lang: Lang; t: (k: string) => string }>({ lang: 'en', t: (k) => k });
export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: (k: string) => translate(lang, k) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
