import { useState, useEffect, useRef } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import InvestigationForm from './components/InvestigationForm'
import ActivityFeed from './components/ActivityFeed'
import OverviewReport from './components/OverviewReport'
import { Investigation, InvestigationWithData } from './types'
import './App.css'

function App() {
  const [user, setUser] = useState<any>(null)
  const [currentInvestigation, setCurrentInvestigation] = useState<Investigation | null>(null)
  const [investigationData, setInvestigationData] = useState<InvestigationWithData | null>(null)
  const [loading, setLoading] = useState(false)
  const [startupError, setStartupError] = useState('')
  const [authError, setAuthError] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const iterationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Check auth status
    const checkUser = async () => {
      if (!isSupabaseConfigured) {
        setStartupError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then restart the app.')
        return
      }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setUser(user)
        }
      } catch (error) {
        console.error('Supabase auth unavailable:', error)
        setStartupError('Could not connect to Supabase. Check VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and the project status.')
      }
    }
    checkUser()

    // Listen for auth changes (only if Supabase is configured)
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null)
      })

      return () => {
        subscription?.unsubscribe()
        // Cleanup interval on unmount
        if (iterationIntervalRef.current) {
          clearInterval(iterationIntervalRef.current)
        }
      }
    }

    return () => {
      if (iterationIntervalRef.current) {
        clearInterval(iterationIntervalRef.current)
      }
    }
  }, [])

  const loadInvestigationData = async (investigationId: string) => {
    try {
      // Load investigation
      const { data: investigation } = await supabase
        .from('investigations')
        .select('*')
        .eq('id', investigationId)
        .single()

      // Load all related data
      const [hypotheses, sources, evidence, critiques] = await Promise.all([
        supabase.from('hypotheses').select('*').eq('investigation_id', investigationId),
        supabase.from('sources').select('*').eq('investigation_id', investigationId),
        supabase.from('evidence').select('*').eq('investigation_id', investigationId),
        supabase.from('critiques').select('*'),
      ])

      // Organize critiques by hypothesis
      const critiquesByHypothesis: { [key: string]: any[] } = {}
      if (critiques.data) {
        for (const critique of critiques.data) {
          const hypothesisId = critique.hypothesis_id
          if (!critiquesByHypothesis[hypothesisId]) {
            critiquesByHypothesis[hypothesisId] = []
          }
          critiquesByHypothesis[hypothesisId].push(critique)
        }
      }

      setInvestigationData({
        investigation: investigation || null,
        hypotheses: hypotheses.data || [],
        critiques: critiquesByHypothesis,
        sources: sources.data || [],
        evidence: evidence.data || [],
      })
    } catch (error) {
      console.error('Error loading investigation data:', error)
    }
  }

  const handleInvestigationStart = async (question: string) => {
    if (!user) return

    try {
      setLoading(true)

      const { data: investigation, error } = await supabase
        .from('investigations')
        .insert({
          user_id: user.id,
          question,
          status: 'running',
        })
        .select()
        .single()

      if (error || !investigation) {
        throw new Error('Failed to create investigation: ' + (error?.message || 'Unknown error'))
      }

      setCurrentInvestigation(investigation)
      await loadInvestigationData(investigation.id)

      // Start the investigation loop
      startInvestigationLoop(investigation.id)
    } catch (error) {
      console.error('Error starting investigation:', error)
      alert(error instanceof Error ? error.message : 'Failed to start investigation. Check the Supabase configuration and authentication.')
    } finally {
      setLoading(false)
    }
  }

  const startInvestigationLoop = (investigationId: string) => {
    // Clear any existing interval
    if (iterationIntervalRef.current) {
      clearInterval(iterationIntervalRef.current)
    }

    const interval = setInterval(async () => {
      const { data: investigation, error: investigationError } = await supabase
        .from('investigations')
        .select('status')
        .eq('id', investigationId)
        .single()

      if (investigationError) {
        console.error('Could not read investigation status:', investigationError)
        return
      }

      if (!investigation || investigation.status !== 'running') {
        // Investigation is not running, stop the loop
        clearInterval(interval)
        iterationIntervalRef.current = null
        return
      }

      await runSingleIteration(investigationId)
      await loadInvestigationData(investigationId)
    }, 3000) // Run iteration every 3 seconds

    iterationIntervalRef.current = interval
  }

  const runSingleIteration = async (investigationId: string) => {
    try {
      const { error } = await supabase.functions.invoke('run-iteration', {
        body: { investigationId },
      })

      if (error) {
        console.error('Iteration failed:', error)
      }
    } catch (error) {
      console.error('Error running iteration:', error)
    }
  }

  const handleGitHubSignIn = async () => {
    setAuthError('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) {
        const message = getAuthErrorMessage(error.message)

        setAuthError(message)
        console.error('GitHub sign-in failed:', error)
      }
    } catch (error) {
      const message = getAuthErrorMessage(error instanceof Error ? error.message : 'GitHub sign-in failed.')

      setAuthError(message)
      console.error('GitHub sign-in error:', error)
    }
  }

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError('')

    if (!authEmail || !authPassword) {
      setAuthError('Enter an email address and password.')
      return
    }

    setLoading(true)
    try {
      const result = isCreatingAccount
        ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
        : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })

      if (result.error) {
        setAuthError(result.error.message)
        return
      }

      if (isCreatingAccount && !result.data.session) {
        setAuthError('Account created. Check your email to confirm it, then sign in.')
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  const getAuthErrorMessage = (message: string) => {
    const normalizedMessage = message.toLowerCase()
    if (normalizedMessage.includes('unsupported provider') || normalizedMessage.includes('provider is not enabled')) {
      return 'GitHub sign-in is not enabled in this Supabase project. In Supabase, open Authentication → Providers → GitHub, enable it, add your GitHub OAuth App client ID and secret, and save.'
    }
    if (normalizedMessage.includes('redirect') || normalizedMessage.includes('url')) {
      return `Supabase rejected the callback URL. Add ${window.location.origin} to Supabase Authentication → URL Configuration → Redirect URLs, then try again.`
    }
    return message
  }

  const handlePause = async () => {
    if (!currentInvestigation) return

    try {
      const { data } = await supabase
        .from('investigations')
        .update({ status: 'paused' })
        .eq('id', currentInvestigation.id)
        .select()
        .single()
      setCurrentInvestigation(data)
    } catch (error) {
      console.error('Error pausing investigation:', error)
    }
  }

  const handleResume = async () => {
    if (!currentInvestigation) return

    try {
      const { data } = await supabase
        .from('investigations')
        .update({ status: 'running' })
        .eq('id', currentInvestigation.id)
        .select()
        .single()
      setCurrentInvestigation(data)
      startInvestigationLoop(currentInvestigation.id)
    } catch (error) {
      console.error('Error resuming investigation:', error)
    }
  }

  const handleStop = async () => {
    if (!currentInvestigation) return
    
    // Clear the interval
    if (iterationIntervalRef.current) {
      clearInterval(iterationIntervalRef.current)
      iterationIntervalRef.current = null
    }
    
    try {
      const { data } = await supabase
        .from('investigations')
        .update({ status: 'stopped' })
        .eq('id', currentInvestigation.id)
        .select()
        .single()
      setCurrentInvestigation(data)
    } catch (error) {
      console.error('Error stopping investigation:', error)
    }
  }

    if (!isSupabaseConfigured || startupError) {
      return (
        <div className="container auth-container">
          <h1>Discovery Engine</h1>
          <p>{startupError || 'Supabase is not configured.'}</p>
          <p>Configure the Supabase project and Edge Function secrets before starting an investigation.</p>
        </div>
      )
    }

    if (!user) {
    return (
      <div className="container auth-container">
        <h1>Discovery Engine</h1>
          <p>Please log in to Supabase to continue.</p>
          {authError && <p className="auth-error" role="alert">{authError}</p>}
          <form className="auth-form" onSubmit={handleEmailAuth}>
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              autoComplete="email"
              required
            />
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
            <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
              {loading ? 'Working...' : isCreatingAccount ? 'Create Account' : 'Sign In With Email'}
            </button>
            <button
              type="button"
              className="auth-switch"
              onClick={() => {
                setIsCreatingAccount((current) => !current)
                setAuthError('')
              }}
            >
              {isCreatingAccount ? 'Already have an account? Sign in' : 'Need an account? Create one'}
            </button>
          </form>
          <div className="auth-divider">or</div>
          <button onClick={handleGitHubSignIn} className="btn btn-primary btn-large">
            Sign in with GitHub
          </button>
          <p className="auth-help">
            Callback URL for this browser: <strong>{window.location.origin}</strong>
          </p>
      </div>
    )
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🔍 Discovery Engine</h1>
        <p>AI-powered research and hypothesis generation</p>
      </header>

      <main className="main-content">
        {!currentInvestigation ? (
          <InvestigationForm onStart={handleInvestigationStart} loading={loading} />
        ) : (
          <div className="investigation-container">
            <div className="investigation-controls">
              <div className="investigation-info">
                <h2>{currentInvestigation.question}</h2>
                <p>Iteration {currentInvestigation.iteration_count} • Status: {currentInvestigation.status}</p>
              </div>
              <div className="controls">
                {currentInvestigation.status === 'running' && (
                  <>
                    <button onClick={handlePause} className="btn btn-secondary">
                      Pause
                    </button>
                    <button onClick={handleStop} className="btn btn-danger">
                      Stop
                    </button>
                  </>
                )}
                {currentInvestigation.status === 'paused' && (
                  <>
                    <button onClick={handleResume} className="btn btn-primary">
                      Resume
                    </button>
                    <button onClick={handleStop} className="btn btn-danger">
                      Stop
                    </button>
                  </>
                )}
                {currentInvestigation.status === 'stopped' && (
                  <button onClick={() => setCurrentInvestigation(null)} className="btn btn-primary">
                    Start New Investigation
                  </button>
                )}
              </div>
            </div>

            {investigationData && (
              <div className="investigation-content">
                <ActivityFeed data={investigationData} />
                <OverviewReport data={investigationData} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
