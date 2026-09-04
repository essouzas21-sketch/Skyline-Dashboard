-- Skyline Dashboard — rode uma vez no SQL Editor do Supabase
-- Project: yyrqusptzsphpbooepan

create table if not exists public.skyline_profiles (
  email text primary key,
  name text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.skyline_profiles enable row level security;

drop policy if exists "skyline_profiles_select_authenticated" on public.skyline_profiles;
create policy "skyline_profiles_select_authenticated"
  on public.skyline_profiles
  for select
  to authenticated
  using (true);

drop policy if exists "skyline_profiles_insert_admin" on public.skyline_profiles;
create policy "skyline_profiles_insert_admin"
  on public.skyline_profiles
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.skyline_profiles p
      where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and p.role = 'admin'
        and p.active = true
    )
  );

drop policy if exists "skyline_profiles_update_admin" on public.skyline_profiles;
create policy "skyline_profiles_update_admin"
  on public.skyline_profiles
  for update
  to authenticated
  using (
    exists (
      select 1 from public.skyline_profiles p
      where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and p.role = 'admin'
        and p.active = true
    )
  )
  with check (
    exists (
      select 1 from public.skyline_profiles p
      where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and p.role = 'admin'
        and p.active = true
    )
  );

drop policy if exists "skyline_profiles_delete_admin" on public.skyline_profiles;
create policy "skyline_profiles_delete_admin"
  on public.skyline_profiles
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.skyline_profiles p
      where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and p.role = 'admin'
        and p.active = true
    )
  );

-- Perfis iniciais (senhas ficam em Authentication → Users)
insert into public.skyline_profiles (email, name, role, active) values
  ('ewerton.santos@gruposkytech.com.br', 'Ewerton Santos', 'admin', true),
  ('tv@gruposkytech.com.br', 'TV Skyline', 'user', true),
  ('hassan.soueid@gruposkytech.com.br', 'Hassan Soueid', 'user', true),
  ('mohamad.ali@gruposkytech.com.br', 'Mohamad Ali', 'user', true),
  ('rafael.santos@gruposkytech.com.br', 'Rafael Santos', 'user', true)
on conflict (email) do update set
  name = excluded.name,
  role = excluded.role,
  active = excluded.active,
  updated_at = now();

-- Depois no painel Supabase:
-- 1) Authentication → Providers → Email: ON
-- 2) Desative "Confirm email" (usuários internos)
-- 3) Authentication → Users → Add user (mesmo e-mail + senha de cada um)
