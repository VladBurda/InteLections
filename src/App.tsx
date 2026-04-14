import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import { getAuthMe, logoutSession } from './lib/api'
import type { SubscriptionPlan } from './types/user'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [authChecking, setAuthChecking] = useState(true)
  const [userName, setUserName] = useState('User')
  const [userRole, setUserRole] = useState('Personal')
  const [userSubscriptionPlan, setUserSubscriptionPlan] = useState<SubscriptionPlan>('free')

  const titleMap: Record<string, string> = useMemo(() => ({
    '/': 'Home - Your Courses',
    '/discover': 'InteLections - Discover',
    '/my-products': 'Intelections - Your Products',
    '/groups-classes': 'Intelections - Groups & Classes',
    '/about': 'About InteLections',
    '/account': 'Account',
  }), [])

  const isCourse = location.pathname.startsWith('/course/')
  const isProfile = location.pathname.startsWith('/profile/')
  const isClassroom = location.pathname.startsWith('/groups-classes/')
  const pageTitle = isCourse ? 'Course' : isProfile ? 'Profile' : isClassroom ? 'Classroom' : (titleMap[location.pathname] ?? 'InteLections')

  useEffect(() => {
    document.title = `InteLections - ${pageTitle}`
  }, [pageTitle])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setAuthChecking(true)
      try {
        const payload = await getAuthMe()
        if (!cancelled) {
          setUserName(payload.user.firstName || 'User')
          setUserRole(payload.user.role || 'Personal')
          setUserSubscriptionPlan(payload.user.subscriptionPlan || 'free')
        }
      } catch {
        if (!cancelled) {
          navigate('/login', { replace: true })
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false)
        }
      }
    }

    const handleAuthRefresh = () => {
      if (!cancelled) {
        void run()
      }
    }

    void run()
    window.addEventListener('intelections-auth-refresh', handleAuthRefresh)

    return () => {
      cancelled = true
      window.removeEventListener('intelections-auth-refresh', handleAuthRefresh)
    }
  }, [navigate, location.pathname])

  async function handleLogout() {
    await logoutSession()
    navigate('/login', { replace: true })
  }

  if (authChecking) {
    return <main className="min-h-dvh grid place-items-center text-sm text-neutral-600">Checking session...</main>
  }

  return (
    <AppShell title={pageTitle} userName={userName} userRole={userRole} userSubscriptionPlan={userSubscriptionPlan} onLogout={handleLogout}>
      <Outlet />
    </AppShell>
  )
}
