import { useState } from 'react'
import './InvestigationForm.css'

interface InvestigationFormProps {
  onStart: (question: string) => void
  loading: boolean
}

export default function InvestigationForm({ onStart, loading }: InvestigationFormProps) {
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    if (question.trim().length < 10) {
      setError('Question must be at least 10 characters')
      return
    }

    onStart(question.trim())
    setQuestion('')
  }

  return (
    <div className="form-container">
      <div className="form-card">
        <h2>Start a New Investigation</h2>
        <p>Ask a question and the Discovery Engine will search the web, generate hypotheses, and iterate until you stop it.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="question">Research Question</label>
            <textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Example: What novel approaches could improve long-term memory retention in large language models?"
              rows={4}
              disabled={loading}
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading} className="btn btn-primary btn-large">
            {loading ? 'Starting...' : 'Start Investigation'}
          </button>
        </form>

        <div className="info-box">
          <h3>How it works</h3>
          <ul>
            <li>🔍 Searches multiple web providers with fallbacks</li>
            <li>💡 Generates novel hypotheses from research</li>
            <li>🛡️ Checks originality against prior art</li>
            <li>🔄 Runs adversarial critiques on each hypothesis</li>
            <li>⏸️ Pause, resume, or stop at any time</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
