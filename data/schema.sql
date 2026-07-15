CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE generation_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft',
  goal TEXT,
  plan_type TEXT,
  raw_choices JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_choices JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step TEXT NOT NULL DEFAULT 'landing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE user_leads (
  lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES generation_sessions(session_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  consent_fitnet_updates BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE exercise_library (
  exercise_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_muscles TEXT[] NOT NULL DEFAULT '{}',
  equipment TEXT[] NOT NULL DEFAULT '{}',
  difficulty TEXT NOT NULL,
  movement_pattern TEXT NOT NULL,
  exercise_type TEXT NOT NULL,
  allowed_places TEXT[] NOT NULL DEFAULT '{}',
  contraindications TEXT[] NOT NULL DEFAULT '{}',
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE food_library (
  food_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  diet_tags TEXT[] NOT NULL DEFAULT '{}',
  allergy_tags TEXT[] NOT NULL DEFAULT '{}',
  protein_g NUMERIC(6,2) NOT NULL,
  carbs_g NUMERIC(6,2) NOT NULL,
  fat_g NUMERIC(6,2) NOT NULL,
  calories INTEGER NOT NULL,
  meal_type TEXT[] NOT NULL DEFAULT '{}',
  reviewed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE generated_plans (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES generation_sessions(session_id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model_name TEXT NOT NULL,
  llm_raw_json JSONB,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_pdf_url TEXT,
  email_delivery_status TEXT NOT NULL DEFAULT 'not_requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE generation_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES generation_sessions(session_id) ON DELETE CASCADE,
  plan_id UUID REFERENCES generated_plans(plan_id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  attempt_type TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model_name TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_events (
  email_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES generation_sessions(session_id) ON DELETE CASCADE,
  lead_id UUID REFERENCES user_leads(lead_id) ON DELETE SET NULL,
  provider TEXT,
  event_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  provider_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE security_events (
  security_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES generation_sessions(session_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_hash TEXT,
  browser_fingerprint_hash TEXT,
  email_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX generation_sessions_status_idx ON generation_sessions(status);
CREATE INDEX user_leads_email_idx ON user_leads(email);
CREATE INDEX generated_plans_session_idx ON generated_plans(session_id);
CREATE INDEX generation_attempts_session_idx ON generation_attempts(session_id);
CREATE INDEX email_events_session_idx ON email_events(session_id);
CREATE INDEX security_events_type_created_idx ON security_events(event_type, created_at);
