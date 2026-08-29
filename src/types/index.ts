export type NoveltyStatus = 
  | 'clearly_established'
  | 'similar_existing'
  | 'modified_version'
  | 'potentially_novel'
  | 'insufficient_evidence';

export type InvestigationStatus = 'running' | 'paused' | 'stopped';

export interface Investigation {
  id: string;
  user_id: string;
  question: string;
  status: InvestigationStatus;
  iteration_count: number;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  investigation_id: string;
  title: string;
  url: string;
  excerpt?: string;
  provider: string;
  retrieved_at: string;
}

export interface Evidence {
  id: string;
  investigation_id: string;
  claim: string;
  source_id?: string;
  evidence_type: string;
  confidence: number;
  created_at: string;
}

export interface Hypothesis {
  id: string;
  investigation_id: string;
  name: string;
  hypothesis: string;
  novelty_status: NoveltyStatus;
  confidence: number;
  superseded_by?: string;
  created_at: string;
  iteration_created: number;
}

export interface Critique {
  id: string;
  hypothesis_id: string;
  critique_text: string;
  weakened: boolean;
  created_at: string;
}

export interface InvestigationWithData {
  investigation: Investigation;
  hypotheses: Hypothesis[];
  critiques: { [hypothesis_id: string]: Critique[] };
  sources: Source[];
  evidence: Evidence[];
}
