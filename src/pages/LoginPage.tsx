import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BriefcaseBusiness, Globe, LogIn, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { getAuthMe, loginWithPassword, registerWithPassword, requestPasswordReset } from '../lib/api'
import type { UserRole } from '../types/user'

type AuthMode = 'login' | 'register'

const roleOptions: Array<{ value: UserRole; label: string; hint: string }> = [
  { value: 'Personal', label: 'Personal', hint: 'Best if you want a flexible creator workspace first.' },
  { value: 'Student', label: 'Student', hint: 'Use classes, assignments, and learner views right away.' },
  { value: 'Teacher', label: 'Teacher', hint: 'Unlock class management and teaching tools immediately.' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login'
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<UserRole>('Personal')
  const [error, setError] = useState('')
  const [oauthLoading, setOauthLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetState, setResetState] = useState<{ loading: boolean; message: string; error: string }>({ loading: false, message: '', error: '' })

  const isRegisterMode = mode === 'register'
  const heading = useMemo(() => isRegisterMode ? 'Create your account' : 'Sign in to continue', [isRegisterMode])

  useEffect(() => {
    document.title = isRegisterMode ? 'InteLections - Create account' : 'InteLections - Login'

    const oauthError = searchParams.get('error')
    if (oauthError) {
      setError(`OAuth login failed: ${oauthError}`)
    }

    let cancelled = false

    const run = async () => {
      try {
        await getAuthMe()
        if (!cancelled) navigate('/', { replace: true })
      } catch {
        // not authenticated -> stay on auth page
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [isRegisterMode, navigate, searchParams])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      setError('Email is required.')
      return
    }
    if (!password.trim()) {
      setError('Password is required.')
      return
    }

    if (isRegisterMode) {
      if (!firstName.trim() || !lastName.trim()) {
        setError('First name and last name are required.')
        return
      }
      if (password.trim().length < 8) {
        setError('Password must be at least 8 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    setSubmitting(true)
    try {
      if (isRegisterMode) {
        await registerWithPassword({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: cleanEmail,
          password,
          role,
        })
      } else {
        await loginWithPassword(cleanEmail, password)
      }
      window.dispatchEvent(new Event('intelections-auth-refresh'))
      navigate('/', { replace: true })
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : (isRegisterMode ? 'Registration failed' : 'Login failed')
      setError(rawMessage === 'Request failed: 500' ? 'The server could not complete sign-in. Restart the backend and try again.' : rawMessage)
    } finally {
      setSubmitting(false)
    }
  }

  async function loginWithGoogle() {
    setError('')
    setOauthLoading(true)

    try {
      const response = await fetch('/api/auth/oauth/google/url', { credentials: 'include' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Could not start Google OAuth')
      }
      window.location.href = payload.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Google OAuth')
      setOauthLoading(false)
    }
  }

  async function onForgotPasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResetState({ loading: false, message: '', error: '' })
    const cleanEmail = (resetEmail || email).trim().toLowerCase()
    if (!cleanEmail) {
      setResetState({ loading: false, message: '', error: 'Enter your email address first.' })
      return
    }

    setResetState({ loading: true, message: '', error: '' })
    try {
      const payload = await requestPasswordReset(cleanEmail)
      if (payload.resetUrl) {
        navigate(`/reset-password?token=${encodeURIComponent(new URL(payload.resetUrl).searchParams.get('token') || '')}`)
        return
      }
      setResetState({ loading: false, message: payload.message, error: '' })
    } catch (e) {
      setResetState({ loading: false, message: '', error: e instanceof Error ? e.message : 'Could not prepare reset flow' })
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setShowForgotPassword(false)
    setResetState({ loading: false, message: '', error: '' })
  }

  return (
    <main className="min-h-dvh bg-white text-neutral-900 grid place-items-center p-4">
      <section className="w-full max-w-xl rounded-[2rem] border border-neutral-200 bg-white shadow-sm p-6 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">InteLections</h1>
          <p className="text-sm text-neutral-600 mt-1">{heading}</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-1.5">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${!isRegisterMode ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${isRegisterMode ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
          >
            Create account
          </button>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          {isRegisterMode ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">First name</span>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <UserRound className="size-4 text-neutral-500" />
                  <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Anna" className="w-full bg-transparent outline-none" />
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Last name</span>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <UserRound className="size-4 text-neutral-500" />
                  <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nowak" className="w-full bg-transparent outline-none" />
                </div>
              </label>
            </div>
          ) : null}

          <label className="grid gap-1">
            <span className="text-sm text-neutral-600">Email</span>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Mail className="size-4 text-neutral-500" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" className="w-full bg-transparent outline-none" />
            </div>
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-neutral-600">Password</span>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Lock className="size-4 text-neutral-500" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isRegisterMode ? 'At least 8 characters' : 'Enter password'} className="w-full bg-transparent outline-none" />
            </div>
          </label>

          {!isRegisterMode ? (
            <div className="-mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(current => !current)
                  setResetEmail(email)
                  setResetState({ loading: false, message: '', error: '' })
                }}
                className="text-sm text-neutral-600 underline-offset-4 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          ) : null}

          {isRegisterMode ? (
            <>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Confirm password</span>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <Lock className="size-4 text-neutral-500" />
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" className="w-full bg-transparent outline-none" />
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Start in mode</span>
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <BriefcaseBusiness className="size-4 text-neutral-500" />
                  <select value={role} onChange={e => setRole(e.target.value as UserRole)} className="w-full bg-transparent outline-none">
                    {roleOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-neutral-500">{roleOptions.find(option => option.value === role)?.hint}</p>
              </label>
            </>
          ) : null}

          {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button type="submit" disabled={submitting} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-black text-white px-4 py-2 font-semibold disabled:opacity-60">
            <LogIn className="size-4" />
            {submitting ? (isRegisterMode ? 'Creating account...' : 'Logging in...') : (isRegisterMode ? 'Create account' : 'Log in')}
          </button>


          {!isRegisterMode && showForgotPassword ? (
            <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                <ShieldCheck className="size-4" /> Password reset
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                A reset link is generated directly in the application instead of being sent by email.
              </p>
              <form className="mt-4 space-y-3" onSubmit={onForgotPasswordSubmit}>
                <label className="grid gap-1">
                  <span className="text-sm text-neutral-600">Account email</span>
                  <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                    <Mail className="size-4 text-neutral-500" />
                    <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="name@example.com" className="w-full bg-transparent outline-none" />
                  </div>
                </label>
                {resetState.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{resetState.error}</p> : null}
                {resetState.message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resetState.message}</p> : null}
                <button type="submit" disabled={resetState.loading} className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60">
                  {resetState.loading ? 'Preparing reset link...' : 'Prepare reset link'}
                </button>
              </form>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <div className="h-px bg-neutral-200 flex-1" />
            <span className="text-xs text-neutral-500">OR</span>
            <div className="h-px bg-neutral-200 flex-1" />
          </div>

          <button type="button" onClick={loginWithGoogle} disabled={oauthLoading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 font-semibold hover:bg-neutral-50 disabled:opacity-60">
            <Globe className="size-4" />
            {oauthLoading ? 'Connecting to Google...' : (isRegisterMode ? 'Continue with Google instead' : 'Continue with Google')}
          </button>
        </form>
      </section>
    </main>
  )
}
