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

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'discover', element: <DiscoverPage /> },
      { path: 'my-products', element: <MyProductsPage />},
      { path: 'account', element: <AccountPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'course/:id', element: <CourseDetailsPage /> },
      // przyszłe strony:
      // { path: 'discover', element: <DiscoverPage /> },
      // { path: 'my-products', element: <MyProductsPage /> },
      // itd.
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
