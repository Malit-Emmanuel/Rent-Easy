'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from './I18n';

export default function Header() {
  const { t, lang } = useI18n();
  const path = usePathname(), router = useRouter();
  const signedIn = path !== '/login';
  const setLang = (l: string) => { document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`; router.refresh(); };
  const signOut = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };
  return (
    <header className="bar">
      <strong>{t('appName')}</strong>
      {signedIn && <nav><Link href="/">{t('home')}</Link><Link href="/verification">{t('verification')}</Link><Link href="/admin">{t('admin')}</Link></nav>}
      <span className="spacer" />
      <label className="lang">{t('language')}{' '}
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('language')}>
          <option value="en">English</option><option value="sw">Kiswahili</option>
        </select>
      </label>
      {signedIn && <button className="link" onClick={signOut}>{t('signOut')}</button>}
    </header>
  );
}
