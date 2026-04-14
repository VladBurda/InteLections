import { useEffect, useMemo, useRef, useState } from 'react'
import { Home, Compass, Package, Users, Info, User, ChevronsLeft, ChevronsRight, LogOut, BellOff, BellRing, Check, X, Sparkles } from 'lucide-react'
import { NavLink, Link } from 'react-router-dom'
import type { SubscriptionPlan } from '../types/user'
import { getClassInviteInbox, respondToClassInvite, updateClassInvitePreferences, type ClassInviteInbox } from '../lib/api'

type AppShellProps = {
  children: React.ReactNode
  title?: string
  userName?: string
  userRole?: string
  userSubscriptionPlan?: SubscriptionPlan
  onLogout?: () => Promise<void> | void
}

const SIDEBAR_W = 280
const SIDEBAR_W_COLLAPSED = 88

export default function AppShell({ children, title = 'History', userName = 'User', userRole = 'Personal', userSubscriptionPlan = 'free', onLogout }: AppShellProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0')
    } catch {
      return
    }
  }, [collapsed])

  const paddingLeft = useMemo(
    () => (collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W),
    [collapsed]
  )

  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      <aside
        className={[
          'fixed top-0 left-0 h-screen border-r border-neutral-200 bg-neutral-50',
          'flex flex-col gap-2 p-3',
          'transition-[width] duration-200 ease-out',
          collapsed ? 'w-[80px]' : 'w-[280px]',
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            {!collapsed && <span className="text-[clamp(18px,3vw,28px)] font-medium">InteLections</span>}
          </div>
          <button
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed(v => !v)}
            className="ml-2 grid place-items-center rounded-md p-1.5 hover:bg-neutral-200"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronsRight className="size-5" /> : <ChevronsLeft className="size-5" />}
          </button>
        </div>

        <nav className="mt-2 flex flex-col gap-1 overflow-y-auto">
          <NavItem to="/" label="Home" icon={<Home className="size-5" />} end collapsed={collapsed} />
          <NavItem to="/discover" label="Discover" icon={<Compass className="size-5" />} collapsed={collapsed} />
          {userRole !== 'Student' ? <NavItem to="/my-products" label="My Products" icon={<Package className="size-5" />} collapsed={collapsed} /> : null}
          <NavItem to="/groups-classes" label="Groups & Classes" icon={<Users className="size-5" />} collapsed={collapsed} />
          <NavItem to="/account" label="Account" icon={<User className="size-5" />} collapsed={collapsed} />
          <NavItem to="/about" label="About InteLections" icon={<Info className="size-5" />} collapsed={collapsed} />
        </nav>
      </aside>

      <main style={{ paddingLeft }} className="min-w-0">
        <Header title={title} userName={userName} userRole={userRole} userSubscriptionPlan={userSubscriptionPlan} onLogout={onLogout} />
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  )
}

function NavItem({
  to,
  label,
  icon,
  end = false,
  collapsed,
}: {
  to: string
  label: string
  icon: React.ReactNode
  end?: boolean
  collapsed?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        [
          'flex items-center rounded-xl px-3 py-2 transition-colors',
          collapsed ? 'justify-center' : 'gap-3',
          isActive ? 'bg-neutral-200 font-medium' : 'hover:bg-neutral-100',
        ].join(' ')
      }
    >
      <span className="grid place-items-center size-9 rounded-full bg-neutral-100">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

function Header({ title, userName, userRole, userSubscriptionPlan, onLogout }: { title: string; userName: string; userRole: string; userSubscriptionPlan: SubscriptionPlan; onLogout?: () => Promise<void> | void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [inviteInbox, setInviteInbox] = useState<ClassInviteInbox>({ hideClassInviteMessages: false, pendingCount: 0, invites: [] })
  const [loadingInvites, setLoadingInvites] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null)

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', onPointerDown)
    }

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [menuOpen])

  useEffect(() => {
    void refreshInviteInbox()
  }, [])

  useEffect(() => {
    if (menuOpen) {
      void refreshInviteInbox()
    }
  }, [menuOpen])

  async function refreshInviteInbox() {
    setLoadingInvites(true)
    setInviteError('')
    try {
      setInviteInbox(await getClassInviteInbox())
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Could not load class invites')
    } finally {
      setLoadingInvites(false)
    }
  }

  async function toggleInviteMessages(hidden: boolean) {
    setInviteError('')
    try {
      setInviteInbox(await updateClassInvitePreferences(hidden))
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Could not update invite preferences')
    }
  }

  async function respond(inviteId: string, action: 'accepted' | 'dismissed') {
    setRespondingInviteId(inviteId)
    setInviteError('')
    try {
      const payload = await respondToClassInvite(inviteId, action)
      setInviteInbox(payload.inbox)
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Could not update the invite')
    } finally {
      setRespondingInviteId(null)
    }
  }

  async function logout() {
    if (!onLogout) return
    setLoggingOut(true)
    try {
      await onLogout()
    } finally {
      setMenuOpen(false)
      setLoggingOut(false)
    }
  }

  return (
    <header className="flex flex-wrap items-center gap-3 md:gap-4 border-b border-neutral-200 px-4 md:px-6 py-3 sticky top-0 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 z-10">
      <h1 className="text-[clamp(22px,3.5vw,40px)] font-bold mr-auto">{title}</h1>
      <div ref={menuRef} className="relative flex items-center gap-3 text-[clamp(14px,1.8vw,18px)]">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span>{`Welcome, ${userName}`}</span>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-medium ${userRole === 'Admin' ? 'border-sky-200 bg-sky-50 text-sky-700' : userRole === 'Teacher' ? 'border-amber-200 bg-amber-50 text-amber-700' : userRole === 'Student' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-neutral-200 bg-white text-neutral-600'}`}>
            {userRole}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          className="size-11 rounded-full bg-neutral-300 border border-black/20 grid place-items-center hover:bg-neutral-200"
          aria-label="User menu"
        >
          <User className="size-5" />
        </button>
        {inviteInbox.pendingCount > 0 && !inviteInbox.hideClassInviteMessages ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-black px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {inviteInbox.pendingCount}
          </span>
        ) : null}

        {menuOpen && (
          <div className="absolute right-0 top-14 w-[min(360px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-200 bg-white shadow-sm p-1">
            <div className="border-b border-neutral-100 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Class invites</p>
                  <p className="text-xs text-neutral-500">
                    {inviteInbox.pendingCount > 0 ? `${inviteInbox.pendingCount} pending` : 'No pending requests'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleInviteMessages(!inviteInbox.hideClassInviteMessages)}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
                >
                  {inviteInbox.hideClassInviteMessages ? <BellRing className="size-3.5" /> : <BellOff className="size-3.5" />}
                  {inviteInbox.hideClassInviteMessages ? 'Show' : 'Hide'}
                </button>
              </div>
            </div>

            {!inviteInbox.hideClassInviteMessages ? (
              <div className="max-h-72 space-y-2 overflow-y-auto px-3 py-3">
                {loadingInvites ? <p className="text-sm text-neutral-500">Loading invites...</p> : null}
                {!loadingInvites && inviteInbox.invites.map(invite => (
                  <article key={invite.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                    <p className="text-sm font-medium text-neutral-900">{invite.className}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {invite.teacherName}
                      {invite.focusArea ? ` / ${invite.focusArea}` : ''}
                    </p>
                    {(invite.meetingLabel || invite.locationLabel) ? (
                      <p className="mt-2 text-xs text-neutral-600">
                        {[invite.meetingLabel, invite.locationLabel].filter(Boolean).join(' / ')}
                      </p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void respond(invite.id, 'accepted')}
                        disabled={respondingInviteId === invite.id}
                        className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        <Check className="size-3.5" />
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => void respond(invite.id, 'dismissed')}
                        disabled={respondingInviteId === invite.id}
                        className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-60"
                      >
                        <X className="size-3.5" />
                        Dismiss
                      </button>
                    </div>
                  </article>
                ))}
                {!loadingInvites && inviteInbox.invites.length === 0 ? (
                  <p className="text-sm text-neutral-500">No pending class invitations right now.</p>
                ) : null}
              </div>
            ) : (
              <div className="px-3 py-3 text-sm text-neutral-500 whitespace-normal break-words">
                Class invite messages are hidden. You can show them again at any time.
              </div>
            )}

            {inviteError ? <p className="px-3 pb-2 text-xs text-red-600">{inviteError}</p> : null}
            <div className="border-t border-neutral-100 px-3 py-3">
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-neutral-900">
                    <Sparkles className="size-4 text-amber-500" />
                    InteLections+
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 whitespace-normal break-words">
                    {userSubscriptionPlan === 'plus'
                      ? 'Active now. Premium uploads are available in your courses.'
                      : 'Free plan. Upgrade in Account to unlock premium uploads.'}
                  </p>
                  <Link
                    to="/account"
                    onClick={() => setMenuOpen(false)}
                    className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline"
                  >
                    Manage subscription
                  </Link>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${userSubscriptionPlan === 'plus' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-neutral-200 bg-white text-neutral-600'}`}>
                  {userSubscriptionPlan === 'plus' ? 'Plus active' : 'Free'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="mt-1 w-full inline-flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-neutral-100 disabled:opacity-60"
            >
              <LogOut className="size-4" />
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
