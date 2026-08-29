-- Enable necessary extensions
create extension if not exists "uuid-ossp";
create extension if not exists "http";

-- Investigations table
create table public.investigations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  status text not null default 'running' check (status in ('running', 'paused', 'stopped')),
  iteration_count integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.investigations enable row level security;
create policy "Users can view their own investigations" on public.investigations
  using (auth.uid() = user_id);
create policy "Users can create investigations" on public.investigations
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own investigations" on public.investigations
  for update using (auth.uid() = user_id);
create policy "Users can delete their own investigations" on public.investigations
  for delete using (auth.uid() = user_id);

-- Sources table
create table public.sources (
  id uuid primary key default uuid_generate_v4(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  title text not null,
  url text not null,
  excerpt text,
  provider text not null,
  retrieved_at timestamp with time zone default now()
);

alter table public.sources enable row level security;
create policy "Users can view sources from their investigations" on public.sources
  using (investigation_id in (select id from public.investigations where user_id = auth.uid()));

-- Evidence table
create table public.evidence (
  id uuid primary key default uuid_generate_v4(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  claim text not null,
  source_id uuid references public.sources(id),
  evidence_type text not null,
  confidence integer not null check (confidence >= 0 and confidence <= 100),
  created_at timestamp with time zone default now()
);

alter table public.evidence enable row level security;
create policy "Users can view evidence from their investigations" on public.evidence
  using (investigation_id in (select id from public.investigations where user_id = auth.uid()));

-- Hypotheses table
create table public.hypotheses (
  id uuid primary key default uuid_generate_v4(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  name text not null,
  hypothesis text not null,
  novelty_status text not null check (novelty_status in ('clearly_established', 'similar_existing', 'modified_version', 'potentially_novel', 'insufficient_evidence')),
  confidence integer not null check (confidence >= 0 and confidence <= 100),
  superseded_by uuid references public.hypotheses(id),
  created_at timestamp with time zone default now(),
  iteration_created integer not null
);

alter table public.hypotheses enable row level security;
create policy "Users can view hypotheses from their investigations" on public.hypotheses
  using (investigation_id in (select id from public.investigations where user_id = auth.uid()));

-- Critiques table
create table public.critiques (
  id uuid primary key default uuid_generate_v4(),
  hypothesis_id uuid not null references public.hypotheses(id) on delete cascade,
  critique_text text not null,
  weakened boolean not null default false,
  created_at timestamp with time zone default now()
);

alter table public.critiques enable row level security;
create policy "Users can view critiques from their hypotheses" on public.critiques
  using (hypothesis_id in (
    select id from public.hypotheses 
    where investigation_id in (select id from public.investigations where user_id = auth.uid())
  ));

-- Indexes for performance
create index idx_investigations_user_id on public.investigations(user_id);
create index idx_investigations_status on public.investigations(status);
create index idx_sources_investigation_id on public.sources(investigation_id);
create index idx_evidence_investigation_id on public.evidence(investigation_id);
create index idx_hypotheses_investigation_id on public.hypotheses(investigation_id);
create index idx_hypotheses_novelty_status on public.hypotheses(novelty_status);
create index idx_critiques_hypothesis_id on public.critiques(hypothesis_id);
