import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
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
  const iterationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Check auth status
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    checkUser()

    // Listen for auth changes
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
      const { data: investigation } = await supabase
        .from('investigations')
        .insert({
          user_id: user.id,
          question,
          status: 'running',
        })
        .select()
        .single()

      setCurrentInvestigation(investigation)
      await loadInvestigationData(investigation.id)

      // Start the investigation loop
      startInvestigationLoop(investigation.id)
    } catch (error) {
      console.error('Error starting investigation:', error)
    } finally {
      setLoading(false)
    }
  }

  const startInvestigationLoop = (investigationId: string) => {
    // Clear any existing interval
    if (iterationIntervalRef.current) {
      clearInterval(iterationIntervalRef.current)
    }

    // Use an interval to trigger iterations
    const interval = setInterval(async () => {
      // Fetch current investigation status from DB to avoid stale closures
      const { data: investigation } = await supabase
        .from('investigations')
        .select('status')
        .eq('id', investigationId)
        .single()

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
      // Call the backend to run one iteration
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-iteration`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ investigationId }),
        }
      )

      if (!response.ok) {
        console.error('Iteration failed:', await response.text())
      }
    } catch (error) {
      console.error('Error running iteration:', error)
    }
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

  if (!user) {
    return (
      <div className="container auth-container">
        <h1>Discovery Engine</h1>
        <p>Please log in to Supabase to continue.</p>
        <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'github' })}>
          Sign in with GitHub
        </button>
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
