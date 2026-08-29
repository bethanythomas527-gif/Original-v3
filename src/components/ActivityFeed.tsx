import { InvestigationWithData } from '../types'
import './ActivityFeed.css'

interface ActivityFeedProps {
  data: InvestigationWithData
}

export default function ActivityFeed({ data }: ActivityFeedProps) {
  const { hypotheses, critiques, sources } = data

  const getNoveltyColor = (status: string) => {
    switch (status) {
      case 'potentially_novel':
        return '#4caf50'
      case 'insufficient_evidence':
        return '#ff9800'
      case 'modified_version':
        return '#2196f3'
      case 'similar_existing':
        return '#ff5722'
      case 'clearly_established':
        return '#9c27b0'
      default:
        return '#666'
    }
  }

  return (
    <div className="activity-feed">
      <h2>Activity Feed</h2>

      {hypotheses.length === 0 ? (
        <div className="empty-state">
          <p>No hypotheses generated yet. Research is starting...</p>
        </div>
      ) : (
        <div className="feed-content">
          {hypotheses.map((hypothesis) => (
            <div key={hypothesis.id} className="feed-item hypothesis-item">
              <div className="hypothesis-header">
                <h3>{hypothesis.name}</h3>
                <span
                  className="novelty-badge"
                  style={{ backgroundColor: getNoveltyColor(hypothesis.novelty_status) }}
                >
                  {hypothesis.novelty_status.replace(/_/g, ' ')}
                </span>
              </div>

              <p className="hypothesis-text">{hypothesis.hypothesis}</p>

              <div className="hypothesis-meta">
                <span className="confidence">
                  Confidence: {hypothesis.confidence}%
                </span>
                <span className="iteration">
                  Iteration {hypothesis.iteration_created}
                </span>
              </div>

              {critiques[hypothesis.id] && critiques[hypothesis.id].length > 0 && (
                <div className="critiques">
                  <h4>Critiques:</h4>
                  {critiques[hypothesis.id].map((critique) => (
                    <div key={critique.id} className="critique">
                      {critique.weakened && (
                        <span className="weakened-badge">Weakened</span>
                      )}
                      <p>{critique.critique_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {sources.length > 0 && (
            <div className="sources-section">
              <h3>Sources Used</h3>
              {sources.slice(0, 5).map((source) => (
                <div key={source.id} className="source-item">
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                  <span className="provider">{source.provider}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
