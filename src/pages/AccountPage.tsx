import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Award,
  BadgeCheck,
  Building2,
  ExternalLink,
  GraduationCap,
  Lock,
  Mail,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { User } from '../types/user';
import AvatarUpload from '../components/AvatarUpload';
import ProfileField from '../components/ProfileField';
import { changePassword, createIntelectionsPlusCheckout, getMe, linkExistingPlusToStripe, openBillingPortal, startSellerConnectOnboarding, syncSellerConnectStatus, updateMe, uploadAvatar } from '../lib/api';

const EMPTY_USER: User = {
  id: '',
  firstName: '',
  lastName: '',
  email: '',
  role: 'Student',
  subscriptionPlan: 'free',
  subscriptionStartedAt: null,
  sellerStripeConnected: false,
  sellerStripeAccountId: null,
  sellerBillingReady: false,
  connectedAccountStatus: 'not_connected',
  canSellPaidCourses: false,
  avatarUrl: '',
  bio: '',
  location: '',
  birthday: '',
  headline: '',
  website: '',
  institution: '',
  specialization: '',
  achievements: [],
  certificates: [],
  activities: [],
  socialLinks: [],
  featuredCourses: [],
};

function formatBirthdayForDisplay(value?: string) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized;
  const [, year, month, day] = match;
  return `${day}/${month}/${year.slice(-2)}`;
}

function normalizeBirthdayForSave(value?: string) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return normalized;

  const shortMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!shortMatch) return normalized;

  const [, day, month, shortYear] = shortMatch;
  const now = new Date();
  const currentShortYear = now.getFullYear() % 100;
  const numericYear = Number(shortYear);
  const fullYear = numericYear <= currentShortYear ? 2000 + numericYear : 1900 + numericYear;
  return `${fullYear}-${month}-${day}`;
}

function normalizeProfileUser(payload: User): User {
  return {
    ...EMPTY_USER,
    ...payload,
    birthday: formatBirthdayForDisplay(payload.birthday),
    achievements: payload.achievements ?? [],
    certificates: payload.certificates ?? [],
    activities: payload.activities ?? [],
    socialLinks: payload.socialLinks ?? [],
    featuredCourses: payload.featuredCourses ?? [],
  };
}

export default function AccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User>(EMPTY_USER);
  const [initialUser, setInitialUser] = useState<User>(EMPTY_USER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [savingSellerConnect, setSavingSellerConnect] = useState(false);
  const [sellerConnectError, setSellerConnectError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const fullName = useMemo(() => `${user.firstName} ${user.lastName}`.trim() || 'Your profile', [user]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const payload = await getMe();
        const normalized = normalizeProfileUser(payload);

        if (!cancelled) {
          setUser(normalized);
          setInitialUser(normalized);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connectState = params.get('connect');
    if (!connectState) return;

    let cancelled = false;
    const run = async () => {
      setSellerConnectError('');
      setSavingSellerConnect(true);
      try {
        const payload = await syncSellerConnectStatus();
        if (cancelled) return;
        const normalized = normalizeProfileUser(payload.user);
        setUser(normalized);
        setInitialUser(normalized);
      } catch (error) {
        if (!cancelled) {
          setSellerConnectError(error instanceof Error ? error.message : 'Could not refresh Stripe seller status');
        }
      } finally {
        if (!cancelled) {
          setSavingSellerConnect(false);
          navigate('/account', { replace: true });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [location.search, navigate]);

  async function save() {
    setSaving(true);
    try {
      const saved = normalizeProfileUser(await updateMe({
        ...user,
        birthday: normalizeBirthdayForSave(user.birthday),
      }));
      setUser(saved);
      setInitialUser(saved);
      window.dispatchEvent(new Event('intelections-auth-refresh'));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setUser(initialUser);
  }

  function onRoleChange(nextRole: User['role']) {
    if (nextRole === user.role) return;

    if (nextRole === 'Teacher' && user.role !== 'Teacher') {
      const confirmed = window.confirm('Switch to Teacher mode? This unlocks teaching-oriented views like classroom management and author workflows.');
      if (!confirmed) return;
    }

    setUser(current => ({ ...current, role: nextRole }));
  }

    async function handleSubscriptionAction() {
    setSubscriptionError('')
    setSavingSubscription(true)
    try {
      if (user.role === 'Admin') {
        return
      }

      const payload = user.subscriptionPlan === 'plus'
        ? await openBillingPortal()
        : await createIntelectionsPlusCheckout()

      if (payload.url) {
        window.location.assign(payload.url)
        return
      }

      const refreshed = normalizeProfileUser(await getMe())
      setUser(refreshed)
      setInitialUser(refreshed)
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : 'Could not open billing right now')
    } finally {
      setSavingSubscription(false)
    }
  }

  async function handleLinkExistingPlus() {
    setSubscriptionError('')
    setSavingSubscription(true)
    try {
      const payload = await linkExistingPlusToStripe()
      if (payload.url) {
        window.location.assign(payload.url)
        return
      }

      const refreshed = normalizeProfileUser(await getMe())
      setUser(refreshed)
      setInitialUser(refreshed)
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : 'Could not link this account to Stripe yet')
    } finally {
      setSavingSubscription(false)
    }
  }

  async function handleSellerConnectAction() {
    setSellerConnectError('')
    setSavingSellerConnect(true)
    try {
      const payload = await startSellerConnectOnboarding()
      if (payload.url) {
        window.location.assign(payload.url)
        return
      }

      const refreshed = normalizeProfileUser((await syncSellerConnectStatus()).user)
      setUser(refreshed)
      setInitialUser(refreshed)
    } catch (error) {
      setSellerConnectError(error instanceof Error ? error.message : 'Could not open Stripe seller onboarding')
    } finally {
      setSavingSellerConnect(false)
    }
  }

  async function handleSellerConnectRefresh() {
    setSellerConnectError('')
    setSavingSellerConnect(true)
    try {
      const refreshed = normalizeProfileUser((await syncSellerConnectStatus()).user)
      setUser(refreshed)
      setInitialUser(refreshed)
    } catch (error) {
      setSellerConnectError(error instanceof Error ? error.message : 'Could not refresh Stripe seller status')
    } finally {
      setSavingSellerConnect(false)
    }
  }

  async function handleChangePassword() {
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('Fill in current password, new password and confirmation.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      const payload = await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccess(payload.message || 'Password updated successfully.');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Could not update password');
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-600">Loading profile...</p>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-[28px] border border-neutral-200 bg-[linear-gradient(135deg,#fffdf7_0%,#fff_42%,#f7f3ea_100%)] p-6 shadow-sm">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-800">
            <Sparkles className="size-4" /> Build a public profile that feels like a portfolio
          </div>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">My Profile</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Add your education, achievements, certificates and activity history so other users can quickly understand your background.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            to={`/profile/${user.id}`}
          >
            View Profile
          </Link>
          <button className="rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50" onClick={cancel}>
            Cancel
          </button>
          <button className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
            <AvatarUpload
              url={user.avatarUrl}
              onChange={async (file) => {
                setUploadingAvatar(true);
                try {
                  const payload = await uploadAvatar(file);
                  setUser(u => ({ ...u, avatarUrl: payload.avatarUrl }));
                  setInitialUser(u => ({ ...u, avatarUrl: payload.avatarUrl }));
                } finally {
                  setUploadingAvatar(false);
                }
              }}
            />
            {uploadingAvatar ? <p className="mt-3 text-sm text-neutral-500">Uploading avatar...</p> : null}

            <div className="mt-5 space-y-2">
              <h3 className="text-2xl font-semibold leading-tight">{fullName}</h3>
              <p className="text-sm text-neutral-600">{user.headline || 'Add a short headline that describes what you do.'}</p>
            </div>

            <div className="mt-5 space-y-3 text-sm text-neutral-700">
              <InfoRow icon={<GraduationCap className="size-4" />} label={user.institution || 'Institution not set'} />
              <InfoRow icon={<Building2 className="size-4" />} label={user.specialization || 'Specialization not set'} />
              <InfoRow icon={<MapPin className="size-4" />} label={user.location || 'Location not set'} />
              <InfoRow icon={<Mail className="size-4" />} label={user.email} />
              {user.website ? <InfoRow icon={<ExternalLink className="size-4" />} label={user.website} /> : null}
            </div>
          </div>

          <SummaryCard title="Profile highlights" icon={<Award className="size-4" />}>
            <div className="grid grid-cols-2 gap-3 text-center">
              <MetricCard value={String(user.achievements?.length ?? 0)} label="Achievements" />
              <MetricCard value={String(user.certificates?.length ?? 0)} label="Certificates" />
              <MetricCard value={String(user.activities?.length ?? 0)} label="Activities" />
              <MetricCard value={String(user.socialLinks?.length ?? 0)} label="Links" />
            </div>
          </SummaryCard>

          <SummaryCard title="Password & sign-in" icon={<Lock className="size-4" />}>
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="grid gap-1">
                  <span className="text-sm text-neutral-600">Current password</span>
                  <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="rounded-2xl border border-neutral-200 px-4 py-3" placeholder="Current password" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm text-neutral-600">New password</span>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="rounded-2xl border border-neutral-200 px-4 py-3" placeholder="At least 8 characters" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm text-neutral-600">Confirm new password</span>
                  <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="rounded-2xl border border-neutral-200 px-4 py-3" placeholder="Repeat the new password" />
                </label>
              </div>
              {passwordError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{passwordError}</div> : null}
              {passwordSuccess ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{passwordSuccess}</div> : null}
              <button
                type="button"
                onClick={() => void handleChangePassword()}
                disabled={changingPassword}
                className="w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
              >
                {changingPassword ? 'Updating password...' : 'Change password'}
              </button>
            </div>
          </SummaryCard>

          <SummaryCard title="InteLections+" icon={<Sparkles className="size-4" />}>
            <div className="space-y-4">
              <div className={`rounded-[22px] border px-4 py-3 text-sm ${user.role === 'Admin' ? 'border-sky-200 bg-sky-50 text-sky-800' : user.subscriptionPlan === 'plus' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {user.role === 'Admin'
                  ? 'Admin accounts bypass Stripe billing so you can review and moderate gated content freely.'
                  : user.subscriptionPlan === 'plus'
                    ? `Active now${user.subscriptionStartedAt ? ` since ${new Date(user.subscriptionStartedAt).toLocaleDateString()}` : ''}.`
                    : 'You are currently on the Free plan.'}
              </div>
              <div className="space-y-2 text-sm leading-6 text-neutral-600">
                <p>InteLections+ unlocks:</p>
                <p>More than 2 teacher-managed classes.</p>
                <p>25 GB course storage instead of the 5 GB free limit.</p>
                <p>Student uploads in course learner areas.</p>
                <p>Hosted lesson videos up to 30 minutes and 250 MB per file instead of the 5 minute free limit.</p>
                <p>AI-generated editable quiz drafts for lesson tests.</p>
                <p>YouTube embeds stay available on the free plan.</p>
              </div>
              {subscriptionError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {subscriptionError}
                </div>
              ) : null}
              {user.role === 'Admin' ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700">
                  Stripe checkout is skipped for admin accounts. You can keep using this workspace to filter premium and paid content safely.
                </div>
              ) : user.subscriptionPlan === 'plus' && !user.billingManaged ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-700">
                    This InteLections+ plan is active in local/demo mode and is not connected to Stripe Customer Portal yet.
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLinkExistingPlus()}
                    disabled={savingSubscription}
                    className="w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
                  >
                    {savingSubscription ? 'Linking profile...' : 'Link existing Plus to Stripe'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSubscriptionAction()}
                  disabled={savingSubscription}
                  className="w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
                >
                  {savingSubscription
                    ? 'Opening billing...'
                    : user.subscriptionPlan === 'plus'
                      ? 'Manage subscription'
                      : 'Buy InteLections+'}
                </button>
              )}
            </div>
          </SummaryCard>

          {user.role !== 'Student' ? (
            <SummaryCard title="Sell paid courses" icon={<Building2 className="size-4" />}>
              <div className="space-y-4">
                <div className={`rounded-[22px] border px-4 py-3 text-sm ${user.sellerBillingReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : user.connectedAccountStatus === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
                  {user.sellerBillingReady
                    ? 'Stripe payouts are ready. You can create and publish paid courses for marketplace sales.'
                    : user.connectedAccountStatus === 'pending'
                      ? 'Stripe seller onboarding has started, but payouts are not ready yet. Finish onboarding to receive course payments.'
                      : 'Connect Stripe payouts before you create or publish paid courses.'}
                </div>
                <div className="space-y-2 text-sm leading-6 text-neutral-600">
                  <p>Paid courses use Stripe Checkout for learners.</p>
                  <p>Course revenue is routed to your Stripe account through Stripe Connect.</p>
                  <p>InteLections keeps a 1% marketplace service fee from each paid course purchase.</p>
                  <p>For defense and local verification, Stripe is expected to run in test mode.</p>
                </div>
                {sellerConnectError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {sellerConnectError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSellerConnectAction()}
                    disabled={savingSellerConnect}
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
                  >
                    {savingSellerConnect
                      ? 'Opening Stripe...'
                      : user.sellerBillingReady
                        ? 'Review seller setup'
                        : user.connectedAccountStatus === 'pending'
                          ? 'Continue Stripe onboarding'
                          : 'Connect Stripe payouts'}
                  </button>
                  {user.sellerStripeConnected ? (
                    <button
                      type="button"
                      onClick={() => void handleSellerConnectRefresh()}
                      disabled={savingSellerConnect}
                      className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {savingSellerConnect ? 'Refreshing...' : 'Refresh Stripe status'}
                    </button>
                  ) : null}
                </div>
              </div>
            </SummaryCard>
          ) : null}
        </aside>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2 text-sm font-medium text-neutral-500">
              <BadgeCheck className="size-4" /> Core information
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ProfileField label="First name" value={user.firstName} editable onChange={v => setUser(u => ({ ...u, firstName: v }))} />
              <ProfileField label="Last name" value={user.lastName} editable onChange={v => setUser(u => ({ ...u, lastName: v }))} />
              <ProfileField label="Email" value={user.email} editable={false} />
              {user.role === 'Admin' ? (
                <ProfileField label="Role" value={user.role} editable={false} />
              ) : (
                <label className="grid self-start gap-1">
                  <span className="text-sm text-neutral-600">Role</span>
                  <select
                    value={user.role}
                    onChange={e => onRoleChange(e.target.value as User['role'])}
                    className="min-h-[54px] rounded-[24px] border border-neutral-200 bg-white px-4 py-3 leading-6 text-neutral-800"
                  >
                    <option value="Personal">Personal</option>
                    <option value="Student">Student</option>
                    <option value="Teacher">Teacher</option>
                  </select>
                  <span className="text-xs leading-5 text-neutral-500">
                    Choose how the app should adapt your workspace and available tools.
                  </span>
                </label>
              )}
              <ProfileField label="Headline" value={user.headline} editable onChange={v => setUser(u => ({ ...u, headline: v }))} placeholder="History educator and course author" />
              <ProfileField label="Location" value={user.location} editable onChange={v => setUser(u => ({ ...u, location: v }))} placeholder="Warsaw, Poland" />
              <ProfileField
                label="Birthday"
                value={user.birthday}
                editable
                type="text"
                placeholder="dd/mm/yy"
                onChange={v => setUser(u => ({ ...u, birthday: v }))}
              />
              <ProfileField label="Website" value={user.website} editable onChange={v => setUser(u => ({ ...u, website: v }))} placeholder="https://..." />
              <ProfileField label="Graduated at / institution" value={user.institution} editable onChange={v => setUser(u => ({ ...u, institution: v }))} placeholder="WSIZ University" />
              <ProfileField label="Specialization" value={user.specialization} editable onChange={v => setUser(u => ({ ...u, specialization: v }))} placeholder="Programming, History Education" />
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm text-neutral-600">About me</span>
                <textarea
                  value={user.bio ?? ''}
                  onChange={e => setUser(u => ({ ...u, bio: e.target.value }))}
                  className="min-h-[132px] rounded-2xl border px-4 py-3"
                  placeholder="Tell others about yourself, your teaching style, academic path and what makes your profile unique."
                />
              </label>
            </div>
          </div>

          <CollectionSection
            title="Achievements"
            icon={<Award className="size-4" />}
            description="Short recognitions, notable milestones or awards."
            emptyText="No achievements added yet."
            onAdd={() => setUser(u => ({
              ...u,
              achievements: [...(u.achievements ?? []), { id: cryptoId('achievement'), title: '', organization: '', yearLabel: '' }],
            }))}
          >
            {(user.achievements ?? []).map((item, index) => (
              <EditableCard
                key={item.id}
                onRemove={() => removeAt(setUser, 'achievements', index)}
                badge={item.yearLabel || 'Achievement'}
                title={item.title}
                subtitle={item.organization}
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <ProfileField label="Title" value={item.title} editable onChange={v => updateListItem(setUser, 'achievements', index, { title: v })} />
                  <ProfileField label="Organization" value={item.organization} editable onChange={v => updateListItem(setUser, 'achievements', index, { organization: v })} />
                  <ProfileField label="Year / range" value={item.yearLabel} editable onChange={v => updateListItem(setUser, 'achievements', index, { yearLabel: v })} placeholder="2025" />
                </div>
              </EditableCard>
            ))}
          </CollectionSection>

          <CollectionSection
            title="Certificates"
            icon={<BadgeCheck className="size-4" />}
            description="Professional certificates, course credentials and verified training."
            emptyText="No certificates added yet."
            onAdd={() => setUser(u => ({
              ...u,
              certificates: [...(u.certificates ?? []), { id: cryptoId('certificate'), title: '', issuer: '', yearLabel: '', credentialUrl: '' }],
            }))}
          >
            {(user.certificates ?? []).map((item, index) => (
              <EditableCard
                key={item.id}
                onRemove={() => removeAt(setUser, 'certificates', index)}
                badge={item.yearLabel || 'Certificate'}
                title={item.title}
                subtitle={item.issuer}
                link={item.credentialUrl}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <ProfileField label="Certificate name" value={item.title} editable onChange={v => updateListItem(setUser, 'certificates', index, { title: v })} />
                  <ProfileField label="Issuer" value={item.issuer} editable onChange={v => updateListItem(setUser, 'certificates', index, { issuer: v })} />
                  <ProfileField label="Year" value={item.yearLabel} editable onChange={v => updateListItem(setUser, 'certificates', index, { yearLabel: v })} />
                  <ProfileField label="Credential URL" value={item.credentialUrl} editable onChange={v => updateListItem(setUser, 'certificates', index, { credentialUrl: v })} placeholder="https://..." />
                </div>
              </EditableCard>
            ))}
          </CollectionSection>

          <CollectionSection
            title="Activities and participation"
            icon={<GraduationCap className="size-4" />}
            description="Conferences, mentoring, academic circles, workshops or volunteer participation."
            emptyText="No activities added yet."
            onAdd={() => setUser(u => ({
              ...u,
              activities: [...(u.activities ?? []), { id: cryptoId('activity'), title: '', organization: '', yearLabel: '', description: '' }],
            }))}
          >
            {(user.activities ?? []).map((item, index) => (
              <EditableCard
                key={item.id}
                onRemove={() => removeAt(setUser, 'activities', index)}
                badge={item.yearLabel || 'Activity'}
                title={item.title}
                subtitle={item.organization}
                link={undefined}
              >
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <ProfileField label="Activity" value={item.title} editable onChange={v => updateListItem(setUser, 'activities', index, { title: v })} />
                    <ProfileField label="Organization" value={item.organization} editable onChange={v => updateListItem(setUser, 'activities', index, { organization: v })} />
                    <ProfileField label="Year / range" value={item.yearLabel} editable onChange={v => updateListItem(setUser, 'activities', index, { yearLabel: v })} placeholder="2024-now" />
                  </div>
                  <label className="grid gap-1">
                    <span className="text-sm text-neutral-600">Description</span>
                    <textarea
                      value={item.description ?? ''}
                      onChange={e => updateListItem(setUser, 'activities', index, { description: e.target.value })}
                      className="min-h-[96px] rounded-2xl border px-4 py-3"
                      placeholder="What did you do there?"
                    />
                  </label>
                </div>
              </EditableCard>
            ))}
          </CollectionSection>

          <CollectionSection
            title="Social links"
            icon={<ExternalLink className="size-4" />}
            description="Links that make the profile feel alive: LinkedIn, Instagram, Facebook, portfolio or community pages."
            emptyText="No social links added yet."
            onAdd={() => setUser(u => ({
              ...u,
              socialLinks: [...(u.socialLinks ?? []), { id: cryptoId('social'), platform: '', url: '' }],
            }))}
          >
            {(user.socialLinks ?? []).map((item, index) => (
              <EditableCard
                key={item.id}
                onRemove={() => removeAt(setUser, 'socialLinks', index)}
                badge={item.platform || 'Social'}
                title={item.platform ? capitalize(item.platform) : 'Platform'}
                subtitle={item.url}
                link={item.url}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <ProfileField label="Platform" value={item.platform} editable onChange={v => updateListItem(setUser, 'socialLinks', index, { platform: v })} placeholder="linkedin" />
                  <ProfileField label="URL" value={item.url} editable onChange={v => updateListItem(setUser, 'socialLinks', index, { url: v })} placeholder="https://..." />
                </div>
              </EditableCard>
            ))}
          </CollectionSection>
        </div>
      </div>

      <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Public profile preview</h3>
            <p className="mt-1 text-sm text-neutral-600">Open the portfolio-like page and see how your profile will look to other users.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/profile/${user.id}`)}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Open view profile
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {(user.achievements ?? []).slice(0, 4).map(item => (
            <div key={item.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
              <div className="font-medium">{item.title || 'Untitled achievement'}</div>
              <div className="mt-1 text-neutral-500">{item.organization || 'Add organization'}</div>
            </div>
          ))}
          {(user.achievements?.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 md:col-span-4">
              Add achievements and certificates to make your public profile more trustworthy and eye-catching.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CollectionSection({
  title,
  description,
  icon,
  emptyText,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  emptyText: string;
  onAdd: () => void;
  children: ReactNode[];
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean);

  return (
    <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500">
            {icon} {title}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p>
        </div>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
          <Plus className="size-4" /> Add
        </button>
      </div>

      <div className="space-y-4">
        {items.length > 0 ? items : (
          <div className="rounded-2xl border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

function EditableCard({
  badge,
  title,
  subtitle,
  link,
  onRemove,
  children,
}: {
  badge: string;
  title?: string;
  subtitle?: string;
  link?: string;
  onRemove: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,#fff_0%,#fcfaf5_100%)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500">{badge}</div>
          <div className="mt-3 text-lg font-semibold text-neutral-900">{title || 'Untitled'}</div>
          {subtitle ? <div className="mt-1 text-sm text-neutral-600">{subtitle}</div> : null}
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm text-neutral-700 underline-offset-4 hover:underline">
              Open link <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
        <button type="button" onClick={onRemove} className="rounded-lg border border-neutral-200 p-2 text-neutral-500 hover:bg-neutral-50" title="Remove item">
          <Trash2 className="size-4" />
        </button>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

function SummaryCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-neutral-500">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-3 py-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function InfoRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-full bg-neutral-100 text-neutral-600">{icon}</span>
      <span className="break-all">{label}</span>
    </div>
  );
}

function updateListItem(
  setUser: Dispatch<SetStateAction<User>>,
  key: 'achievements' | 'certificates' | 'activities' | 'socialLinks',
  index: number,
  patch: Record<string, string>,
) {
  setUser(current => ({
    ...current,
    [key]: (current[key] ?? []).map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
  }));
}

function removeAt<K extends 'achievements' | 'certificates' | 'activities' | 'socialLinks'>(
  setUser: Dispatch<SetStateAction<User>>,
  key: K,
  index: number,
) {
  setUser(current => ({
    ...current,
    [key]: (current[key] ?? []).filter((_, itemIndex) => itemIndex !== index),
  }));
}

function cryptoId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function capitalize(value: string) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : value;
}











