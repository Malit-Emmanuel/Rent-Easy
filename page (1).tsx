'use client';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/I18n';
import { api } from '@/lib/client';

const REJECT_REASONS = ['id_mismatch', 'face_mismatch', 'liveness_failed', 'document_invalid', 'duplicate_identity', 'provider_error', 'manual_reject'];

export default function Admin() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[] | null>(null), [denied, setDenied] = useState(false), [reason, setReason] = useState<Record<string, string>>({}), [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await api('admin/verifications/queue');
    if (r.status === 403) { setDenied(true); return; }
    setItems(r.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function decide(id: string, decision: 'approve' | 'reject') {
    setError('');
    const r = await api(`admin/verifications/${id}/decision`, { method: 'POST', body: { decision, reasonCode: reason[id] ?? 'manual_reject' } });
    if (r.status === 200) load(); else setError(t('genericError'));
  }
  if (denied) return <p className="error">{t('noAccess')}</p>;
  return (
    <>
      <h1>{t('admin')}</h1>
      {items === null ? <p className="msg">{t('loading')}</p> : items.length === 0 ? <p className="msg">{t('emptyQueue')}</p> :
        items.map((i) => (
          <div className="card" key={i.id}>
            <div><span className="badge">{t('st_' + i.status)}</span> {i.reason_code && <span className="msg">{i.reason_code}</span>}</div>
            <label htmlFor={'r' + i.id}>{t('reason')}</label>
            <select id={'r' + i.id} value={reason[i.id] ?? 'manual_reject'} onChange={(e) => setReason({ ...reason, [i.id]: e.target.value })}>
              {REJECT_REASONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="row"><button onClick={() => decide(i.id, 'approve')}>{t('approve')}</button>
              <button className="danger" onClick={() => decide(i.id, 'reject')}>{t('reject')}</button></div>
          </div>
        ))}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
