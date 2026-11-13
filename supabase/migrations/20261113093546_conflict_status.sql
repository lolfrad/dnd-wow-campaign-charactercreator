-- Return a deliberate HTTP 409 for a revision conflict instead of a server error.
create or replace function public.save_character(p_id uuid, p_revision integer, p_config jsonb, p_snapshot text)
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
    if not found then raise exception 'This character changed in another tab. Reload it or save a copy.' using errcode = 'PT409'; end if;
  end if;
  return next result;
end $$;
