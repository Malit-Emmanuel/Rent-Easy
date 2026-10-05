'use client';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/I18n';
import { api } from '@/lib/client';

export default function Verification() {
  const { t } = useI18n();
  const [s, setS] = useState<any>(null), [link, setLink] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => setS((await api('me/verification')).data), []);
  useEffect(() => { load(); }, [load]);
  async function start() {
    setBusy(true); setError('');
    const r = await api('me/verification', { method: 'POST' });
    setBusy(false);
    if (r.status === 200) { setLink(r.data?.redirectUrl ?? null); load(); } else setError(r.status === 429 ? t('tooMany') : t('genericError'));
  }
  const latest = s?.latest;
  return (
    <>
      <h1>{t('verification')}</h1>
      {!s ? <p className="msg">{t('loading')}</p> : (
        <div className="card">
          <p><strong>{t('status')}:</strong> <span className="badge">{s.verified ? t('verified') : latest ? t('st_' + latest.status) : t('notVerified')}</span></p>
          {s.verified && s.badgeExpiresAt && <p className="msg">{t('expiresOn')} {new Date(s.badgeExpiresAt).toLocaleDateString()}</p>}
          {link && <p><a href={link} target="_blank" rel="noopener noreferrer">{t('continueVerification')}</a></p>}
          {!s.verified && <button onClick={start} disabled={busy}>{t('startVerification')}</button>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </>
  );
}
