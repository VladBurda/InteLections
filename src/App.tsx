import { Outlet, useLocation } from 'react-router-dom'
import AppShell from './layouts/AppShell'

export default function App() {
  const location = useLocation()

  const titleMap: Record<string, string> = {
    '/': 'Home - Your Courses',
    '/discover': 'InteLections - Discover',
    '/my-products': 'Intelections - Your Products',
    '/groups-classes': 'Intelections - Groups & Classes',
    '/about': 'About InteLections',
    '/account': 'Account',
  }

  const isCourse = location.pathname.startsWith('/course/')
  const pageTitle = isCourse ? 'Course' : (titleMap[location.pathname] ?? 'InteLections')

  // also update <title> in <head>, optional
  document.title = `InteLections — ${pageTitle}`

  return (
    <AppShell title={pageTitle}>
      <Outlet />
    </AppShell>
  )
}

