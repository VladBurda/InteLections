import { useEffect, useState } from 'react'
import { getAuthMe, getDemoStatus } from '../lib/api'

type DemoStatus = Awaited<ReturnType<typeof getDemoStatus>>

export default function AboutPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [status, setStatus] = useState<DemoStatus | null>(null)
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    document.title = 'InteLections - About'

    let cancelled = false
    const run = async () => {
      try {
        const auth = await getAuthMe()
        if (cancelled) return

        const admin = auth.user.role === 'Admin'
        setIsAdmin(admin)

        if (!admin) return

        const payload = await getDemoStatus()
        if (!cancelled) setStatus(payload)
      } catch (error) {
        if (!cancelled) {
          setStatusError(error instanceof Error ? error.message : 'Could not load environment status')
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-6">
      <div className="px-1 py-2">
        <h2 className="text-3xl font-semibold tracking-tight text-neutral-950">About InteLections</h2>
        <div className="mt-5 max-w-5xl space-y-5 text-[15px] leading-8 text-neutral-600">
          <p>
            InteLections is an educational web application created for building courses, organizing lesson materials,
            and supporting both independent learning and classroom-based teaching in one environment.
          </p>
          <p>
            The main idea of the platform is to connect course authoring, quizzes, groups and classes, and digital
            learning support in one role-based system for students, teachers, creators.
          </p>
          <p>
            A course can be structured into lessons, folders, and different kinds of educational materials, including
            documents, audio files, hosted video, and embedded YouTube resources. This makes it possible to prepare
            complete learning paths inside one application instead of distributing content across multiple tools.
          </p>
          <p>
            InteLections also supports quizzes, answer review, and AI-assisted draft test generation, which helps
            teachers prepare lesson checks faster while still keeping full editorial control over the final content.
          </p>
          <p>
            The application includes classroom features such as invites, assigned courses, and separate views for
            teachers and learners. It also introduces subscription and marketplace foundations, which makes it possible
            to extend the platform beyond free educational content into paid publishing and seller payouts.
          </p>
          <div className="pt-2">
            <h3 className="text-lg font-semibold text-neutral-900">Contact</h3>
            <p className="mt-2">
              Support and general platform questions: <a className="text-neutral-900 underline underline-offset-4" href="mailto:support@intelections.app">support@intelections.app</a>
            </p>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <article className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-neutral-950">Environment status</h3>
          {statusError ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statusError}
            </p>
          ) : null}

          {status ? (
            <div className="mt-4 space-y-3">
              <StatusRow label="Environment" value={status.environment === 'local-demo' ? 'Local' : status.environment} />
              <StatusRow label="OpenAI" value={status.ai.configured ? `Configured (${status.ai.model ?? 'model not set'})` : 'Not configured'} />
              <StatusRow label="Stripe" value={status.billing.stripeConfigured ? (status.billing.testModeExpected ? 'Configured in test mode' : 'Configured') : 'Not configured'} />
              <StatusRow label="Webhook" value={status.billing.webhookConfigured ? 'Configured' : 'Missing'} />
              <StatusRow label="Google OAuth" value={status.oauth.googleConfigured ? 'Configured' : 'Not configured'} />
              <StatusRow label="Marketplace fee" value={`${status.billing.sellerMarketplaceFeePercent}%`} />
            </div>
          ) : !statusError ? (
            <p className="mt-4 text-sm text-neutral-500">Loading environment status...</p>
          ) : null}
        </article>
      ) : null}
    </section>
  )
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <span className="text-sm text-neutral-600">{value}</span>
    </div>
  )
}
