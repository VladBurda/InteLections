import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, ShieldCheck } from 'lucide-react'
import { resetPasswordWithToken } from '../lib/api'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    document.title = 'InteLections - Reset password'
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('This reset link is incomplete. Request a new one from the login page.')
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

    setSubmitting(true)
    try {
      await resetPasswordWithToken({ token, password })
      window.dispatchEvent(new Event('intelections-auth-refresh'))
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-dvh bg-white text-neutral-900 grid place-items-center p-4">
      <section className="w-full max-w-md rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
            <ShieldCheck className="size-4" /> Password recovery
          </div>
          <h1 className="mt-4 text-3xl font-bold">Set a new password</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Choose a new password for your InteLections account. After saving it, we will sign you in automatically.
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="grid gap-1">
            <span className="text-sm text-neutral-600">New password</span>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Lock className="size-4 text-neutral-500" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-neutral-600">Confirm new password</span>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Lock className="size-4 text-neutral-500" />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat the password"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </label>

          {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Saving password...' : 'Save new password'}
          </button>
        </form>

        <Link to="/login" className="mt-5 inline-flex text-sm text-neutral-600 underline-offset-4 hover:underline">
          Back to login
        </Link>
      </section>
    </main>
  )
}
