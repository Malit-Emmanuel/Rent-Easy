export type Lang = 'en' | 'sw';
export const LANGS: Lang[] = ['en', 'sw'];

// Swahili strings need review by a native speaker before the pilot.
export const dict = {
  en: {
    appName: 'Housing Platform', signIn: 'Sign in', signOut: 'Sign out', language: 'Language',
    phoneLabel: 'Mobile number', phoneHint: 'e.g. 0712 345 678', sendCode: 'Send code', codeLabel: '6-digit code',
    verify: 'Verify', back: 'Back', codeSent: 'We sent a code by SMS. It expires in 5 minutes.',
    badPhone: 'Enter a valid Kenyan mobile number.', badCode: 'That code is wrong or expired.', tooMany: 'Too many attempts. Try again later.',
    genericError: 'Something went wrong. Please try again.', loading: 'Loading…',
    home: 'Home', myOrgs: 'My organisations', noOrgs: 'You are not part of an organisation yet.',
    createOrg: 'Create an organisation', orgName: 'Organisation name', orgKind: 'Type', create: 'Create',
    kind_agency: 'Agency', kind_management_firm: 'Management firm', kind_landlord: 'Landlord',
    verification: 'ID verification', status: 'Status', startVerification: 'Start verification', verified: 'Verified',
    notVerified: 'Not verified', continueVerification: 'Continue in the verification window', expiresOn: 'Valid until',
    members: 'Members', invite: 'Invite staff', role: 'Role', remove: 'Remove', inviteSent: 'Invitation sent by SMS.',
    role_manager_admin: 'Administrator', role_manager_staff: 'Staff', role_agent: 'Agent', role_landlord: 'Landlord',
    admin: 'Review queue', emptyQueue: 'Nothing waiting for review.', approve: 'Approve', reject: 'Reject', reason: 'Reason',
    noAccess: 'You do not have access to this page.',
    st_PENDING: 'Pending', st_IN_PROGRESS: 'In progress', st_VERIFIED: 'Verified', st_FAILED: 'Failed',
    st_REVIEW_REQUIRED: 'Awaiting review', st_EXPIRED: 'Expired',
  },
  sw: {
    appName: 'Jukwaa la Makazi', signIn: 'Ingia', signOut: 'Toka', language: 'Lugha',
    phoneLabel: 'Namba ya simu', phoneHint: 'mf. 0712 345 678', sendCode: 'Tuma msimbo', codeLabel: 'Msimbo wa tarakimu 6',
    verify: 'Thibitisha', back: 'Rudi', codeSent: 'Tumekutumia msimbo kwa SMS. Utaisha baada ya dakika 5.',
    badPhone: 'Weka namba sahihi ya simu ya Kenya.', badCode: 'Msimbo huo si sahihi au umeisha muda.', tooMany: 'Majaribio mengi mno. Jaribu tena baadaye.',
    genericError: 'Hitilafu imetokea. Tafadhali jaribu tena.', loading: 'Inapakia…',
    home: 'Mwanzo', myOrgs: 'Mashirika yangu', noOrgs: 'Bado hujajiunga na shirika lolote.',
    createOrg: 'Unda shirika', orgName: 'Jina la shirika', orgKind: 'Aina', create: 'Unda',
    kind_agency: 'Wakala', kind_management_firm: 'Kampuni ya usimamizi', kind_landlord: 'Mwenye nyumba',
    verification: 'Uthibitisho wa kitambulisho', status: 'Hali', startVerification: 'Anza uthibitisho', verified: 'Imethibitishwa',
    notVerified: 'Haijathibitishwa', continueVerification: 'Endelea kwenye dirisha la uthibitisho', expiresOn: 'Halali hadi',
    members: 'Wanachama', invite: 'Alika mfanyakazi', role: 'Wadhifa', remove: 'Ondoa', inviteSent: 'Mwaliko umetumwa kwa SMS.',
    role_manager_admin: 'Msimamizi', role_manager_staff: 'Mfanyakazi', role_agent: 'Wakala', role_landlord: 'Mwenye nyumba',
    admin: 'Foleni ya mapitio', emptyQueue: 'Hakuna kitu kinachosubiri mapitio.', approve: 'Idhinisha', reject: 'Kataa', reason: 'Sababu',
    noAccess: 'Huna ruhusa ya kufikia ukurasa huu.',
    st_PENDING: 'Inasubiri', st_IN_PROGRESS: 'Inaendelea', st_VERIFIED: 'Imethibitishwa', st_FAILED: 'Imeshindwa',
    st_REVIEW_REQUIRED: 'Inasubiri mapitio', st_EXPIRED: 'Imeisha muda',
  },
} as const;
export type Key = keyof typeof dict.en;

export const normaliseLang = (v: string | undefined | null): Lang => (v === 'sw' ? 'sw' : 'en');
export const translate = (lang: Lang, key: string): string =>
  (dict[lang] as Record<string, string>)[key] ?? (dict.en as Record<string, string>)[key] ?? key;
