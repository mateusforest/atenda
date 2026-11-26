begin;

create table public.atenda_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 240),
  configuration jsonb not null default '{}' check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);

create table public.atenda_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  agent_id uuid,
  contact_name text not null,
  status text not null default 'waiting' check (status in ('waiting','agent','team','closed')),
  created_at timestamptz not null default now(),
  foreign key (owner_id, agent_id) references public.atenda_agents(owner_id, id)
);
create index atenda_conversations_owner_created on public.atenda_conversations(owner_id, created_at desc);

alter table public.atenda_agents enable row level security;
alter table public.atenda_conversations enable row level security;

revoke all on public.atenda_agents, public.atenda_conversations from public, anon, authenticated;
grant select, insert, update, delete on public.atenda_agents, public.atenda_conversations to authenticated;
create policy owner_agents on public.atenda_agents for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy owner_conversations on public.atenda_conversations for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

commit;
