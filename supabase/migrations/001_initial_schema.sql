-- Profiles table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for auto-profile creation
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Leads table
create table if not exists public.leads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  company text default '',
  position text default '',
  linkedin_url text,
  linkedin_stage text default 'not_connected',
  icp_score jsonb default '{}',
  company_intel jsonb default '{}',
  draft_messages jsonb default '[]',
  contact_history jsonb default '[]',
  channels jsonb default '{}',
  next_action text,
  next_action_date timestamptz,
  follow_up_date timestamptz,
  disqualify_reason text,
  source text default 'manual',
  raw_data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for fast user-scoped queries
create index if not exists leads_user_id_idx on public.leads(user_id);
create index if not exists leads_linkedin_stage_idx on public.leads(linkedin_stage);
create index if not exists leads_follow_up_date_idx on public.leads(follow_up_date);

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
  before update on public.leads
  for each row execute procedure public.update_updated_at();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.leads enable row level security;

-- Profiles: users can read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Leads: users can CRUD their own leads
create policy "Users can view own leads"
  on public.leads for select
  using (auth.uid() = user_id);

create policy "Users can insert own leads"
  on public.leads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own leads"
  on public.leads for update
  using (auth.uid() = user_id);

create policy "Users can delete own leads"
  on public.leads for delete
  using (auth.uid() = user_id);
