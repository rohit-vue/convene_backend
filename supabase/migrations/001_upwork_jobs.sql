-- Run this in the Supabase SQL editor to create the upwork_jobs table.

create table if not exists public.upwork_jobs (
  id uuid primary key default gen_random_uuid(),

  title text,
  description text,
  job_type text,
  budget text,
  hourly_rate text,
  experience_level text,
  duration text,
  weekly_hours text,
  skills text[] not null default '{}',
  category text,

  client_country text,
  client_rating text,
  client_spent text,
  hire_rate text,
  hires text,
  proposals text,
  posted_time text,
  payment_verified boolean not null default false,

  url text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists upwork_jobs_url_key on public.upwork_jobs (url);
create index if not exists upwork_jobs_created_at_idx on public.upwork_jobs (created_at desc);
