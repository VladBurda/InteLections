import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Award,
  BadgeCheck,
  BookOpen,
  Building2,
  ExternalLink,
  Facebook,
  Globe,
  GraduationCap,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Medal,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { User, UserSocialLink } from '../types/user';
import { getAuthMe, getProfile, setUserProfileVisibility } from '../lib/api';

const EMPTY_PROFILE: User = {
  id: '',
  firstName: '',
  lastName: '',
  email: '',
  role: 'Student',
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

export default function ProfileViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<User>(EMPTY_PROFILE);
  const [viewer, setViewer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingModeration, setSavingModeration] = useState(false);
  const [moderationError, setModerationError] = useState('');

  useEffect(() => {
    if (!id) {
      navigate('/discover', { replace: true });
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const [payload, auth] = await Promise.all([getProfile(id), getAuthMe().catch(() => null)]);
        if (!cancelled) {
          setProfile({ ...EMPTY_PROFILE, ...payload });
          setViewer(auth?.user ?? null);
        }
      } catch {
        if (!cancelled) {
          navigate('/discover', { replace: true });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const fullName = useMemo(() => `${profile.firstName} ${profile.lastName}`.trim(), [profile]);
  const canModerateProfile = viewer?.role === 'Admin' && viewer.id !== profile.id;
  const chips = useMemo(() => {
    const values = [
      ...(profile.achievements ?? []).slice(0, 2).map(item => item.title),
      ...(profile.certificates ?? []).slice(0, 1).map(item => item.title),
      profile.institution,
      ...(profile.activities ?? []).slice(0, 1).map(item => item.organization || item.title),
    ].filter(Boolean);
    return values.slice(0, 5) as string[];
  }, [profile]);

  async function onToggleProfileVisibility(blocked: boolean) {
    if (!canModerateProfile || !profile.id) return;

    setSavingModeration(true);
    setModerationError('');
    try {
      const result = await setUserProfileVisibility(profile.id, { blocked });
      setProfile(current => ({ ...current, profileBlocked: result.blocked }));
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : 'Could not update profile visibility');
    } finally {
      setSavingModeration(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-600">Loading profile...</p>;
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] border border-neutral-200 bg-[linear-gradient(135deg,#f5f1e8_0%,#ffffff_38%,#fbf8ef_100%)] p-6 shadow-sm md:p-8">
        <div className="space-y-5">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-neutral-500">InteLections - Discover</p>
            <h1 className="mt-3 text-[clamp(2rem,4vw,3.4rem)] font-semibold tracking-tight">{fullName || 'Author profile'}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-neutral-600">{profile.headline || 'A complete profile with achievements, certificates and educational background.'}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {chips.map(chip => (
              <span key={chip} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/90 px-4 py-2 text-sm text-neutral-700 shadow-sm">
                <Medal className="size-4 text-amber-500" /> {chip}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-start">
            <div className="grid size-40 place-items-center overflow-hidden rounded-[28px] bg-neutral-100 text-neutral-300">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={fullName} className="h-full w-full object-cover" />
              ) : (
                <UserCircle2 className="size-24" />
              )}
            </div>

            <div className="mt-6 space-y-2">
              <h2 className="text-3xl font-semibold">{fullName}</h2>
              <p className="text-sm text-neutral-500">{profile.role}</p>
            </div>

            <div className="mt-6 space-y-3 text-sm text-neutral-700">
              <MetaRow icon={<GraduationCap className="size-4" />} text={profile.institution || 'Institution not provided'} />
              <MetaRow icon={<Building2 className="size-4" />} text={profile.specialization || 'Specialization not provided'} />
              <MetaRow icon={<MapPin className="size-4" />} text={profile.location || 'Location not provided'} />
              <MetaRow icon={<Mail className="size-4" />} text={profile.email} />
              {profile.website ? <MetaRow icon={<Globe className="size-4" />} text={profile.website} /> : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {(profile.socialLinks ?? []).map(link => (
                <SocialLinkPill key={link.id} link={link} />
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-neutral-500">
              <Sparkles className="size-4" /> About
            </div>
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_280px]">
              <p className="max-w-none break-words whitespace-pre-line text-[15px] leading-8 text-neutral-700">
                {profile.bio || 'This user has not added a personal bio yet.'}
              </p>
              <div className="rounded-[28px] bg-[linear-gradient(180deg,#faf8f2_0%,#f2ede1_100%)] p-5">
                <h3 className="text-2xl font-semibold">Profile snapshot</h3>
                <div className="mt-5 grid gap-3">
                  <StatTile value={String(profile.achievements?.length ?? 0)} label="Achievements" />
                  <StatTile value={String(profile.certificates?.length ?? 0)} label="Certificates" />
                  <StatTile value={String(profile.activities?.length ?? 0)} label="Activities" />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <ProfilePanel title="Achievements" icon={<Award className="size-4" />}>
              {(profile.achievements ?? []).length > 0 ? (
                (profile.achievements ?? []).map(item => (
                  <ChipCard key={item.id} title={item.title} subtitle={joinLine(item.organization, item.yearLabel)} />
                ))
              ) : (
                <EmptyPanel text="No achievements listed yet." />
              )}
            </ProfilePanel>

            <ProfilePanel title="Certificates" icon={<BadgeCheck className="size-4" />}>
              {(profile.certificates ?? []).length > 0 ? (
                (profile.certificates ?? []).map(item => (
                  <ChipCard
                    key={item.id}
                    title={item.title}
                    subtitle={joinLine(item.issuer, item.yearLabel)}
                    link={item.credentialUrl}
                  />
                ))
              ) : (
                <EmptyPanel text="No certificates listed yet." />
              )}
            </ProfilePanel>
          </section>

          <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-neutral-500">
              <GraduationCap className="size-4" /> Participation and activity
            </div>
            <div className="space-y-4">
              {(profile.activities ?? []).length > 0 ? (
                (profile.activities ?? []).map(item => (
                  <div key={item.id} className="rounded-[26px] border border-neutral-200 bg-[linear-gradient(180deg,#fff_0%,#faf8f2_100%)] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                        <p className="mt-1 text-sm text-neutral-500">{joinLine(item.organization, item.yearLabel)}</p>
                      </div>
                      {item.yearLabel ? <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">{item.yearLabel}</span> : null}
                    </div>
                    {item.description ? <p className="mt-3 text-sm leading-7 text-neutral-700">{item.description}</p> : null}
                  </div>
                ))
              ) : (
                <EmptyPanel text="No activity history listed yet." />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          {canModerateProfile ? (
            <section className="rounded-[30px] border border-neutral-200 bg-[linear-gradient(180deg,#faf8f2_0%,#f1ebdc_100%)] p-6 shadow-sm">
              <h3 className="text-2xl font-semibold">Admin moderation</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-700">Hide this profile from public profile pages while keeping the account active in the system.</p>
              <div className="mt-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
                Current status: <span className="font-medium text-neutral-900">{profile.profileBlocked ? 'Profile hidden' : 'Profile visible'}</span>
              </div>
              {moderationError ? <p className="mt-3 text-sm text-red-600">{moderationError}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onToggleProfileVisibility(true)}
                  disabled={savingModeration || Boolean(profile.profileBlocked)}
                  className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                >
                  {savingModeration && !profile.profileBlocked ? 'Saving...' : 'Hide profile'}
                </button>
                <button
                  type="button"
                  onClick={() => void onToggleProfileVisibility(false)}
                  disabled={savingModeration || !profile.profileBlocked}
                  className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                >
                  {savingModeration && profile.profileBlocked ? 'Saving...' : 'Show profile'}
                </button>
              </div>
            </section>
          ) : null}

          <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-neutral-500">
              <BookOpen className="size-4" /> Portfolio
            </div>
            <div className="space-y-3">
              {(profile.featuredCourses ?? []).length > 0 ? (
                (profile.featuredCourses ?? []).map(course => (
                  <Link key={course.id} to={`/course/${course.id}`} className="block rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,#fff_0%,#faf7ef_100%)] p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
                    <div>
                      <h3 className="font-semibold">{course.title}</h3>
                      <p className="mt-1 text-sm text-neutral-500">{course.category} / {course.level}</p>
                    </div>
                  </Link>
                ))
              ) : (
                <EmptyPanel text="No public courses to display yet." />
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-neutral-200 bg-[linear-gradient(180deg,#faf8f2_0%,#f1ebdc_100%)] p-6 shadow-sm">
            <h3 className="text-2xl font-semibold">Why this profile stands out</h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-neutral-700">
              <li>Clear education and specialization info.</li>
              <li>Achievements and certificates are visible at a glance.</li>
              <li>Activity history gives credibility and context.</li>
              <li>Portfolio section connects profile with authored courses.</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ProfilePanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-neutral-500">
        {icon} {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ChipCard({ title, subtitle, link }: { title: string; subtitle?: string; link?: string }) {
  return (
    <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,#fff_0%,#fbf8ef_100%)] p-4">
      <h3 className="font-semibold text-neutral-900">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm text-neutral-700 underline-offset-4 hover:underline">
          Show credential <ExternalLink className="size-4" />
        </a>
      ) : null}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[24px] border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500">{text}</div>;
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[22px] bg-white px-4 py-4 shadow-sm">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-500">{label}</div>
    </div>
  );
}

function MetaRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="grid w-full grid-cols-[44px_minmax(0,1fr)] items-start gap-3">
      <span className="mt-0.5 grid size-8 place-items-center rounded-full bg-neutral-100 text-neutral-600">{icon}</span>
      <span className="break-words leading-7">{text}</span>
    </div>
  );
}

function SocialLinkPill({ link }: { link: UserSocialLink }) {
  const icon = socialIcon(link.platform);
  return (
    <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex size-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow">
      {icon}
    </a>
  );
}

function socialIcon(platform: string) {
  const normalized = platform.toLowerCase();
  if (normalized.includes('instagram')) return <Instagram className="size-5 text-pink-500" />;
  if (normalized.includes('facebook')) return <Facebook className="size-5 text-blue-600" />;
  if (normalized.includes('linkedin')) return <Linkedin className="size-5 text-sky-700" />;
  return <ExternalLink className="size-5 text-neutral-700" />;
}

function joinLine(first?: string, second?: string) {
  return [first, second].filter(Boolean).join(' / ');
}



