create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_owner_read on public.profiles for select to authenticated using (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create function public.forge_create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
declare handle text := lower(new.raw_user_meta_data->>'username');
begin
  if handle is null or handle !~ '^[a-z0-9_]{3,24}$' or new.email <> handle || '@users.tokenforge.invalid' then
    raise exception 'Invalid Token Forge username.';
  end if;
  insert into public.profiles(id,username) values(new.id,handle);
  return new;
end $$;
revoke all on function public.forge_create_profile() from public, anon, authenticated;
create trigger forge_profile_after_signup after insert on auth.users for each row execute function public.forge_create_profile();

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 200000),
  schema_version integer not null default 1 check (schema_version = 1),
  asset_snapshot text not null check (asset_snapshot ~ '^[0-9]+-[a-f0-9]{12}-v1(-[0-9]+)?$'),
  revision integer not null default 1 check (revision > 0),
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (config->>'name' = name and config->>'schemaVersion' = schema_version::text)
);
create index characters_owner_updated on public.characters(owner_id, updated_at desc);
alter table public.characters enable row level security;
create policy characters_owner_read on public.characters for select to authenticated using (owner_id = (select auth.uid()));
create policy characters_owner_delete on public.characters for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.characters from anon, authenticated;
grant select, delete on public.characters to authenticated;

create function public.save_character(p_id uuid, p_revision integer, p_config jsonb, p_snapshot text)
returns setof public.characters language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result public.characters;
begin
  if actor is null then raise exception 'Sign in to save characters.' using errcode = '42501'; end if;
  if p_config->>'name' is null or p_config->>'schemaVersion' is distinct from '1' then raise exception 'Invalid character configuration.'; end if;
  if p_id is null then
    if (select count(*) from public.characters where owner_id=actor) >= 200 then raise exception 'Your library has reached the 200 character limit.'; end if;
    insert into public.characters(owner_id,name,config,asset_snapshot) values(actor,p_config->>'name',p_config,p_snapshot) returning * into result;
  else
    update public.characters set name=p_config->>'name',config=p_config,asset_snapshot=p_snapshot,revision=revision+1,updated_at=now()
      where id=p_id and owner_id=actor and revision=p_revision returning * into result;
    if not found then raise exception 'This character changed in another tab. Reload it or save a copy.' using errcode = '40001'; end if;
  end if;
  return next result;
end $$;
revoke all on function public.save_character(uuid,integer,jsonb,text) from public, anon;
grant execute on function public.save_character(uuid,integer,jsonb,text) to authenticated;

create table public.character_shares (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index shares_character on public.character_shares(character_id);
create index shares_owner on public.character_shares(owner_id);
alter table public.character_shares enable row level security;
create policy shares_owner_read on public.character_shares for select to authenticated using (owner_id=(select auth.uid()));
create policy shares_owner_revoke on public.character_shares for delete to authenticated using (owner_id=(select auth.uid()));
revoke all on public.character_shares from anon, authenticated;
grant select(id,character_id,owner_id,created_at,expires_at), delete on public.character_shares to authenticated;

create function public.create_character_share(p_character_id uuid) returns table(id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); secret text; share_id uuid;
begin
  if actor is null or not exists(select 1 from public.characters c where c.id=p_character_id and c.owner_id=actor) then raise exception 'Character not found.' using errcode='42501'; end if;
  if (select count(*) from public.character_shares s where s.character_id=p_character_id) >= 20 then raise exception 'Revoke an old link before creating another.'; end if;
  secret := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.character_shares(character_id,owner_id,token_hash) values(p_character_id,actor,extensions.digest(secret,'sha256')) returning character_shares.id into share_id;
  return query select share_id,secret;
end $$;
revoke all on function public.create_character_share(uuid) from public, anon;
grant execute on function public.create_character_share(uuid) to authenticated;

create function public.resolve_character_share(p_token text) returns setof public.characters
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view this character.' using errcode='42501'; end if;
  if p_token !~ '^[a-f0-9]{64}$' then return; end if;
  return query select c.* from public.characters c join public.character_shares s on s.character_id=c.id
    where s.token_hash=extensions.digest(p_token,'sha256') and s.owner_id=c.owner_id and (s.expires_at is null or s.expires_at>now());
end $$;
revoke all on function public.resolve_character_share(text) from public, anon;
grant execute on function public.resolve_character_share(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('character-thumbnails','character-thumbnails',false,131072,array['image/webp'])
on conflict(id) do nothing;
create policy forge_thumbnail_read on storage.objects for select to authenticated using(bucket_id='character-thumbnails' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy forge_thumbnail_insert on storage.objects for insert to authenticated with check(bucket_id='character-thumbnails' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.characters c where c.owner_id=(select auth.uid()) and storage.objects.name=c.owner_id::text||'/'||c.id::text||'.webp'));
create policy forge_thumbnail_update on storage.objects for update to authenticated using(bucket_id='character-thumbnails' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='character-thumbnails' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy forge_thumbnail_delete on storage.objects for delete to authenticated using(bucket_id='character-thumbnails' and (storage.foldername(name))[1]=(select auth.uid())::text);

create function public.set_character_thumbnail(p_id uuid) returns void language sql security definer set search_path = '' as $$
  update public.characters set thumbnail_path=owner_id::text||'/'||id::text||'.webp' where id=p_id and owner_id=auth.uid();
$$;
revoke all on function public.set_character_thumbnail(uuid) from public, anon;
grant execute on function public.set_character_thumbnail(uuid) to authenticated;

create table private.signup_limits (key text primary key, window_start timestamptz not null, attempts integer not null);
alter table private.signup_limits enable row level security;
create function public.forge_signup_allowed(p_key text) returns boolean language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  delete from private.signup_limits where window_start < now()-interval '2 hours';
  insert into private.signup_limits(key,window_start,attempts) values(p_key,date_trunc('hour',now()),1)
    on conflict(key) do update set attempts=case when signup_limits.window_start=date_trunc('hour',now()) then signup_limits.attempts+1 else 1 end, window_start=date_trunc('hour',now()) returning attempts into used;
  return used<=10;
end $$;
revoke all on function public.forge_signup_allowed(text) from public, anon, authenticated;
grant execute on function public.forge_signup_allowed(text) to service_role;
