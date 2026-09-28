-- Extensions privées, sans modification des tables de collection existantes.
begin;
create table if not exists public.collector_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('set','wishlist','purchase','preferences')),
  entry_id text not null check (length(entry_id) between 1 and 200),
  value jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now(),
  primary key(user_id,kind,entry_id)
);
alter table public.collector_documents enable row level security;
drop policy if exists collector_own_documents on public.collector_documents;
create policy collector_own_documents on public.collector_documents for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select,insert,update,delete on public.collector_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('collection-photos','collection-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,
allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists collector_private_photos on storage.objects;
create policy collector_private_photos on storage.objects for all to authenticated
using (bucket_id='collection-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='collection-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Restauration atomique. Les droits et RLS de l'appelant restent appliqués.
-- Un aperçu périmé annule la transaction entière au lieu d'écraser une modification.
create or replace function public.restore_collector_backup(operations jsonb)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare op jsonb; payload jsonb; previous jsonb; target_table text; allowed text[];
  columns_sql text; values_sql text; assignments_sql text; affected integer; total integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations)>10000 then
    raise exception 'Sauvegarde trop volumineuse ou invalide'; end if;
  -- Évite deux restaurations simultanées du même compte.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  for op in select * from jsonb_array_elements(operations) loop
    target_table := op->>'table';
    if target_table not in ('owned_sets','minifigs','wishlist','collector_documents') or
      (op->>'action') not in ('insert','update') then raise exception 'Opération interdite'; end if;
    payload := (op->'row') || jsonb_build_object('user_id',auth.uid());
    if jsonb_typeof(payload)<>'object' then raise exception 'Fiche invalide'; end if;
    if target_table='collector_documents' then
      select to_jsonb(d) into previous from public.collector_documents d
        where user_id=auth.uid() and kind=payload->>'kind' and entry_id=payload->>'entry_id' for update;
      if op->>'action'='update' then
        if previous is null or previous is distinct from op->'expected' then raise exception 'Aperçu périmé : rechargez la sauvegarde'; end if;
        update public.collector_documents set value=payload->'value',updated_at=now()
          where user_id=auth.uid() and kind=payload->>'kind' and entry_id=payload->>'entry_id';
      else
        insert into public.collector_documents(user_id,kind,entry_id,value)
          values(auth.uid(),payload->>'kind',payload->>'entry_id',payload->'value');
      end if;
    else
      if coalesce(payload->>'id','')='' then raise exception 'Identifiant manquant'; end if;
      execute format('select to_jsonb(t) from public.%I t where id::text=$1 and user_id=$2 for update',target_table)
        into previous using payload->>'id',auth.uid();
      if op->>'action'='update' and (previous is null or previous is distinct from op->'expected') then
        raise exception 'Aperçu périmé : rechargez la sauvegarde'; end if;
      allowed := case target_table
        when 'owned_sets' then array['id','user_id','set_num','name','year','theme_name','num_parts','img_url','quantity','condition','build_status','price_paid','current_value','purchase_date','notes','created_at']
        when 'minifigs' then array['id','user_id','fig_num','name','img_url','quantity','condition','price_paid','owned_set_id','created_at']
        else array['id','user_id','set_num','name','year','theme_name','num_parts','img_url','estimated_price','priority','created_at'] end;
      select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),
        string_agg(format('%I=r.%I',key,key),',') into columns_sql,values_sql,assignments_sql
      from jsonb_object_keys(payload) as payload_keys(key) where key=any(allowed)
        and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=target_table and c.column_name=payload_keys.key);
      if op->>'action'='insert' then
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r',target_table,columns_sql,values_sql,target_table) using payload;
      else
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id::text=$2 and t.user_id=$3',target_table,assignments_sql,target_table)
          using payload,payload->>'id',auth.uid();
      end if;
      get diagnostics affected = row_count;
      if affected<>1 then raise exception 'Une fiche n''a pas pu être restaurée'; end if;
    end if;
    total := total+1;
  end loop;
  return total;
end $$;
revoke all on function public.restore_collector_backup(jsonb) from public,anon;
grant execute on function public.restore_collector_backup(jsonb) to authenticated;
commit;
