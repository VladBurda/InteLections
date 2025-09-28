import { useEffect, useMemo, useState } from 'react'
import { Search, Home, Compass, Package, Users, Info, User, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { NavLink } from 'react-router-dom'

type AppShellProps = {
  children: React.ReactNode
  title?: string
}

const SIDEBAR_W = 280
const SIDEBAR_W_COLLAPSED = 88

export default function AppShell({ children, title = 'History' }: AppShellProps) {
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
    } catch {}
  }, [collapsed])

  const paddingLeft = useMemo(
    () => (collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W),
    [collapsed]
  )

  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      {/* Fixed Sidebar (desktop & tablet) */}
      <aside
        className={[
          'fixed top-0 left-0 h-screen border-r border-neutral-200 bg-neutral-50',
          'flex flex-col gap-2 p-3',
          'transition-[width] duration-200 ease-out',
          collapsed ? 'w-[80px]' : 'w-[280px]',
        ].join(' ')}
      >
        {/* Brand + Toggle */}
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

        {/* Nav */}
        <nav className="mt-2 flex flex-col gap-1 overflow-y-auto">
          <NavItem to="/" label="Home" icon={<Home className="size-5" />} end collapsed={collapsed} />
          <NavItem to="/discover" label="Discover" icon={<Compass className="size-5" />} collapsed={collapsed} />
          <NavItem to="/my-products" label="My Products" icon={<Package className="size-5" />} collapsed={collapsed} />
          <NavItem to="/groups-classes" label="Groups & Classes" icon={<Users className="size-5" />} collapsed={collapsed} />
          <NavItem to="/account" label="Account" icon={<User className="size-5" />} collapsed={collapsed} />
          <NavItem to="/about" label="About InteLections" icon={<Info className="size-5" />} collapsed={collapsed} />
        </nav>
      </aside>

      {/* Main: odsunięty o szerokość sidebara, przewija się tylko content */}
      <main style={{ paddingLeft }} className="min-w-0">
        <Header title={title} />
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

function Header({ title }: { title: string }) {
  return (
    <header className="flex flex-wrap items-center gap-3 md:gap-4 border-b border-neutral-200 px-4 md:px-6 py-3 sticky top-0 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 z-10">
      <h1 className="text-[clamp(22px,3.5vw,40px)] font-bold mr-auto">{title}</h1>
      <label className="flex items-center gap-2 rounded-full border border-neutral-900 px-3 py-2 min-w-60 max-w-96 flex-1">
        <Search aria-hidden className="size-5" />
        <input className="w-full bg-transparent outline-none text-[clamp(14px,1.8vw,18px)]" placeholder="Search in recent" />
      </label>
      <div className="flex items-center gap-3 text-[clamp(14px,1.8vw,18px)] whitespace-nowrap">
        <span>Welcome, Username</span>
        <div className="size-11 rounded-full bg-neutral-300 border border-black/20" aria-hidden />
      </div>
    </header>
  )
}
