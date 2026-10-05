'use client';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/I18n';
import { api } from '@/lib/client';

export default function Org() {
  const { t } = useI18n();
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<any>(null), [members, setMembers] = useState<any[]>([]), [isAdmin, setIsAdmin] = useState(false);
  const [denied, setDenied] = useState(false), [phone, setPhone] = useState(''), [role, setRole] = useState('manager_staff'), [note, setNote] = useState('');

  const load = useCallback(async () => {
    const o = await api(`orgs/${orgId}`);
    if (o.status === 403 || o.status === 404) { setDenied(true); return; }
    setOrg(o.data);
    const me = await api('me');
    setIsAdmin(!!me.data?.memberships?.some((m: any) => m.orgId === orgId && m.role === 'manager_admin'));
    const m = await api(`orgs/${orgId}/members`);
    setMembers(m.status === 200 ? m.data : []);
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault(); setNote('');
    const r = await api(`orgs/${orgId}/invitations`, { method: 'POST', body: { phone, role } });
    if (r.status === 201) { setPhone(''); setNote(t('inviteSent')); } else setNote(r.status === 400 ? t('badPhone') : t('genericError'));
  }
  async function remove(userId: string) {
    const r = await api(`orgs/${orgId}/members/${userId}`, { method: 'DELETE' });
    if (r.status === 204) load(); else setNote(t('genericError'));
  }
  if (denied) return <p className="error">{t('noAccess')}</p>;
  if (!org) return <p className="msg">{t('loading')}</p>;
  return (
    <>
      <h1>{org.name}</h1>
      <p className="msg">{t('kind_' + org.kind)}</p>
      <h2>{t('members')}</h2>
      {members.map((m) => (
        <div className="card row" key={m.userId + m.role}>
          <span>{m.name ?? m.phone} · {t('role_' + m.role)}</span><span className="spacer" />
          {isAdmin && <button className="danger" onClick={() => remove(m.userId)}>{t('remove')}</button>}
        </div>
      ))}
      {isAdmin && (
        <>
          <h2>{t('invite')}</h2>
          <form onSubmit={invite}>
            <label htmlFor="ph">{t('phoneLabel')}</label>
            <input id="ph" inputMode="tel" placeholder={t('phoneHint')} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <label htmlFor="role">{t('role')}</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              {['manager_staff', 'manager_admin', 'agent'].map((r) => <option key={r} value={r}>{t('role_' + r)}</option>)}
            </select>
            <button>{t('invite')}</button>
          </form>
        </>
      )}
      {note && <p className="msg" role="status">{note}</p>}
    </>
  );
}
