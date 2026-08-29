import { InvestigationWithData } from '../types'
import './OverviewReport.css'

interface OverviewReportProps {
  data: InvestigationWithData
}

export default function OverviewReport({ data }: OverviewReportProps) {
  const { hypotheses, sources, evidence } = data

  const novelCounts = {
    potentially_novel: hypotheses.filter(h => h.novelty_status === 'potentially_novel').length,
    insufficient_evidence: hypotheses.filter(h => h.novelty_status === 'insufficient_evidence').length,
    modified_version: hypotheses.filter(h => h.novelty_status === 'modified_version').length,
    similar_existing: hypotheses.filter(h => h.novelty_status === 'similar_existing').length,
    clearly_established: hypotheses.filter(h => h.novelty_status === 'clearly_established').length,
  }

  const avgConfidence = hypotheses.length > 0
    ? Math.round(hypotheses.reduce((sum, h) => sum + h.confidence, 0) / hypotheses.length)
    : 0

  return (
    <div className="overview-report">
      <h2>Overview Report</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{hypotheses.length}</div>
          <div className="stat-label">Total Hypotheses</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{sources.length}</div>
          <div className="stat-label">Sources Found</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{avgConfidence}%</div>
          <div className="stat-label">Avg Confidence</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{evidence.length}</div>
          <div className="stat-label">Evidence Points</div>
        </div>
      </div>

      <div className="novelty-breakdown">
        <h3>Novelty Breakdown</h3>
        <div className="breakdown-bars">
          <div className="breakdown-item">
            <div className="bar-label">Potentially Novel</div>
            <div className="bar-container">
              <div
                className="bar-fill"
                style={{
                  width: `${(novelCounts.potentially_novel / Math.max(hypotheses.length, 1)) * 100}%`,
                  backgroundColor: '#4caf50',
                }}
              />
            </div>
            <div className="bar-count">{novelCounts.potentially_novel}</div>
          </div>

          <div className="breakdown-item">
            <div className="bar-label">Insufficient Evidence</div>
            <div className="bar-container">
              <div
                className="bar-fill"
                style={{
                  width: `${(novelCounts.insufficient_evidence / Math.max(hypotheses.length, 1)) * 100}%`,
                  backgroundColor: '#ff9800',
                }}
              />
            </div>
            <div className="bar-count">{novelCounts.insufficient_evidence}</div>
          </div>

          <div className="breakdown-item">
            <div className="bar-label">Modified Version</div>
            <div className="bar-container">
              <div
                className="bar-fill"
                style={{
                  width: `${(novelCounts.modified_version / Math.max(hypotheses.length, 1)) * 100}%`,
                  backgroundColor: '#2196f3',
                }}
              />
            </div>
            <div className="bar-count">{novelCounts.modified_version}</div>
          </div>

          <div className="breakdown-item">
            <div className="bar-label">Similar Existing</div>
            <div className="bar-container">
              <div
                className="bar-fill"
                style={{
                  width: `${(novelCounts.similar_existing / Math.max(hypotheses.length, 1)) * 100}%`,
                  backgroundColor: '#ff5722',
                }}
              />
            </div>
            <div className="bar-count">{novelCounts.similar_existing}</div>
          </div>

          <div className="breakdown-item">
            <div className="bar-label">Clearly Established</div>
            <div className="bar-container">
              <div
                className="bar-fill"
                style={{
                  width: `${(novelCounts.clearly_established / Math.max(hypotheses.length, 1)) * 100}%`,
                  backgroundColor: '#9c27b0',
                }}
              />
            </div>
            <div className="bar-count">{novelCounts.clearly_established}</div>
          </div>
        </div>
      </div>

      <div className="key-insights">
        <h3>Key Insights</h3>
        <ul>
          <li>Showing {novelCounts.potentially_novel + novelCounts.insufficient_evidence} potentially novel findings</li>
          <li>Rejected {novelCounts.similar_existing + novelCounts.clearly_established} non-novel hypotheses</li>
          {sources.length > 0 && (
            <li>Average confidence across hypotheses: {avgConfidence}%</li>
          )}
          {sources.length === 0 && (
            <li>Waiting for research iteration to complete...</li>
          )}
        </ul>
      </div>
    </div>
  )
}
