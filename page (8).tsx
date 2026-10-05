'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18n';

export default function Login() {
  const { t } = useI18n(); const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState(''), [code, setCode] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return r.status;
  }
  async function sendCode(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const s = await post('/api/auth/request', { phone });
    setBusy(false);
    if (s === 200) setStep('code'); else setError(s === 400 ? t('badPhone') : s === 429 ? t('tooMany') : t('genericError'));
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const s = await post('/api/auth/verify', { phone, code });
    setBusy(false);
    if (s === 200) { router.replace('/'); router.refresh(); } else setError(s === 401 ? t('badCode') : s === 429 ? t('tooMany') : t('genericError'));
  }
  return (
    <>
      <h1>{t('signIn')}</h1>
      {step === 'phone' ? (
        <form onSubmit={sendCode}>
          <label htmlFor="phone">{t('phoneLabel')}</label>
          <input id="phone" inputMode="tel" autoComplete="tel" placeholder={t('phoneHint')} value={phone} onChange={(e) => setPhone(e.target.value)} required />
          <button disabled={busy}>{t('sendCode')}</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="msg">{t('codeSent')}</p>
          <label htmlFor="code">{t('codeLabel')}</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
          <div className="row"><button disabled={busy}>{t('verify')}</button>
            <button type="button" className="link" onClick={() => { setStep('phone'); setCode(''); setError(''); }}>{t('back')}</button></div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
