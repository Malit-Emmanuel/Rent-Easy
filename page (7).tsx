'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/I18n';
import { api } from '@/lib/client';

interface OrgRow { id: string; name: string; kind: string; roles: string[] }

export default function Home() {
  const { t } = useI18n();
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [name, setName] = useState(''), [kind, setKind] = useState('management_firm'), [error, setError] = useState('');
  const [verified, setVerified] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const me = await api('me');
    if (me.status !== 200) return;
    const byOrg = new Map<string, string[]>();
    for (const m of me.data.memberships) byOrg.set(m.orgId, [...(byOrg.get(m.orgId) ?? []), m.role]);
    const rows = await Promise.all([...byOrg].map(async ([id, roles]) => {
      const o = await api(`orgs/${id}`);
      return { id, roles, name: o.data?.name ?? id, kind: o.data?.kind ?? '' };
    }));
    setOrgs(rows);
    setVerified((await api('me/verification')).data?.verified ?? false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault(); setError('');
    const r = await api('orgs', { method: 'POST', body: { name, kind } });
    if (r.status === 201) { setName(''); load(); } else setError(t('genericError'));
  }
  return (
    <>
      <h1>{t('home')}</h1>
      <div className="card"><strong>{t('verification')}:</strong>{' '}
        <span className="badge">{verified === null ? t('loading') : verified ? t('verified') : t('notVerified')}</span>{' '}
        <Link href="/verification">→</Link></div>
      <h2>{t('myOrgs')}</h2>
      {orgs === null ? <p className="msg">{t('loading')}</p> : orgs.length === 0 ? <p className="msg">{t('noOrgs')}</p> :
        orgs.map((o) => (
          <div className="card" key={o.id}><Link href={`/orgs/${o.id}`}><strong>{o.name}</strong></Link>
            <div className="msg">{t('kind_' + o.kind)} · {o.roles.map((r) => t('role_' + r)).join(', ')}</div></div>
        ))}
      <h2>{t('createOrg')}</h2>
      <form onSubmit={create}>
        <label htmlFor="org">{t('orgName')}</label>
        <input id="org" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
        <label htmlFor="kind">{t('orgKind')}</label>
        <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {['agency', 'management_firm', 'landlord'].map((k) => <option key={k} value={k}>{t('kind_' + k)}</option>)}
        </select>
        <button>{t('create')}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </>
  );
}
