create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  type text not null default 'dog' check (type in ('dog', 'cat', 'bird', 'other')),
  breed text,
  age text,
  status text not null default 'healthy' check (status in ('healthy', 'vaccine-due')),
  clinical_notes text,
  image_url text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.pets add column if not exists clinical_notes text;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  title text not null,
  scheduled_at timestamptz not null default now(),
  assigned_to uuid references public.profiles(id) on delete set null,
  completed boolean not null default false,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  points integer not null default 0,
  type text not null default 'food' check (type in ('food', 'walk', 'medicine', 'bath')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Membro')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_family_member(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family and fm.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.pets enable row level security;
alter table public.tasks enable row level security;
alter table public.activities enable row level security;

insert into storage.buckets (id, name, public)
values ('pet-images', 'pet-images', true)
on conflict (id) do nothing;

drop policy if exists "pet_images_public_read" on storage.objects;
create policy "pet_images_public_read"
on storage.objects
for select
using (bucket_id = 'pet-images');

drop policy if exists "pet_images_auth_insert" on storage.objects;
create policy "pet_images_auth_insert"
on storage.objects
for insert
with check (bucket_id = 'pet-images' and auth.role() = 'authenticated');

drop policy if exists "pet_images_auth_update" on storage.objects;
create policy "pet_images_auth_update"
on storage.objects
for update
using (bucket_id = 'pet-images' and auth.role() = 'authenticated')
with check (bucket_id = 'pet-images' and auth.role() = 'authenticated');

drop policy if exists "pet_images_auth_delete" on storage.objects;
create policy "pet_images_auth_delete"
on storage.objects
for delete
using (bucket_id = 'pet-images' and auth.role() = 'authenticated');

-- Profiles policies
drop policy if exists "profiles_select_own_or_family" on public.profiles;
create policy "profiles_select_own_or_family"
on public.profiles
for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.family_members fm_self
    join public.family_members fm_target
      on fm_target.family_id = fm_self.family_id
    where fm_self.user_id = auth.uid()
      and fm_target.user_id = profiles.id
  )
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

-- Families policies
drop policy if exists "families_select_member" on public.families;
create policy "families_select_member"
on public.families
for select
using (public.is_family_member(id) or created_by = auth.uid());

drop policy if exists "families_insert_creator" on public.families;
create policy "families_insert_creator"
on public.families
for insert
with check (created_by = auth.uid());

drop policy if exists "families_update_admin" on public.families;
create policy "families_update_admin"
on public.families
for update
using (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = families.id and fm.user_id = auth.uid() and fm.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.family_members fm
    where fm.family_id = families.id and fm.user_id = auth.uid() and fm.role = 'admin'
  )
);

-- Family members policies
drop policy if exists "family_members_select_member" on public.family_members;
create policy "family_members_select_member"
on public.family_members
for select
using (public.is_family_member(family_id));

drop policy if exists "family_members_insert_self_or_admin" on public.family_members;
create policy "family_members_insert_self_or_admin"
on public.family_members
for insert
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.family_members fm
    where fm.family_id = family_members.family_id and fm.user_id = auth.uid() and fm.role = 'admin'
  )
);

-- Pets policies
drop policy if exists "pets_select_member" on public.pets;
create policy "pets_select_member"
on public.pets
for select
using (public.is_family_member(family_id));

drop policy if exists "pets_insert_member" on public.pets;
create policy "pets_insert_member"
on public.pets
for insert
with check (public.is_family_member(family_id) and created_by = auth.uid());

drop policy if exists "pets_update_member" on public.pets;
create policy "pets_update_member"
on public.pets
for update
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

-- Tasks policies
drop policy if exists "tasks_select_member" on public.tasks;
create policy "tasks_select_member"
on public.tasks
for select
using (public.is_family_member(family_id));

drop policy if exists "tasks_insert_member" on public.tasks;
create policy "tasks_insert_member"
on public.tasks
for insert
with check (public.is_family_member(family_id));

drop policy if exists "tasks_update_member" on public.tasks;
create policy "tasks_update_member"
on public.tasks
for update
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

-- Activities policies
drop policy if exists "activities_select_member" on public.activities;
create policy "activities_select_member"
on public.activities
for select
using (public.is_family_member(family_id));

drop policy if exists "activities_insert_member" on public.activities;
create policy "activities_insert_member"
on public.activities
for insert
with check (public.is_family_member(family_id) and user_id = auth.uid());
