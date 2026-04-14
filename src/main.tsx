import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import HomePage from './pages/HomePage'
import DiscoverPage from './pages/DiscoverPage'
import MyProductsPage from './pages/MyProductsPage'
import AccountPage from './pages/AccountPage'
import AboutPage from './pages/AboutPage'
import CourseDetailsPage from './pages/CourseDetailsPage'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ProfileViewPage from './pages/ProfileViewPage'
import GroupsClassesPage from './pages/GroupsClassesPage'
import ClassDetailPage from './pages/ClassDetailPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'discover', element: <DiscoverPage /> },
      { path: 'my-products', element: <MyProductsPage />},
      { path: 'groups-classes', element: <GroupsClassesPage /> },
      { path: 'groups-classes/:classId', element: <ClassDetailPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'profile/:id', element: <ProfileViewPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'course/:id', element: <CourseDetailsPage /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
