-- =============================================================================
-- Available beds and friend referrals.
--
-- Owners/managers can list a vacant bed so that the residents of the same
-- business see it in the resident app. A resident can then ask for that bed on
-- behalf of a friend; the request lands in the owner dashboard.
--
-- Residents never get table access to other beds: they read listings through
-- list_available_beds() (SECURITY DEFINER, scoped to the businesses they stay
-- with) and write requests through request_bed().
-- =============================================================================

alter table public.beds add column is_listed boolean not null default false;

create type public.bed_request_status as enum ('new', 'contacted', 'booked', 'declined', 'cancelled');

create table public.bed_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  bed_id uuid,
  requested_by_resident_id uuid,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  friend_name text not null check (char_length(friend_name) between 2 and 120),
  friend_phone text not null check (char_length(friend_phone) between 6 and 20),
  move_in_date date,
  note text check (char_length(note) <= 500),
  status public.bed_request_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, bed_id) references public.beds (tenant_id, id) on delete set null (bed_id),
  foreign key (tenant_id, requested_by_resident_id) references public.residents (tenant_id, id) on delete set null (requested_by_resident_id)
);
create index bed_requests_tenant_idx on public.bed_requests (tenant_id, status, created_at desc);
create trigger bed_requests_updated_at before update on public.bed_requests
  for each row execute function private.set_updated_at();

alter table public.bed_requests enable row level security;
create policy bed_requests_select on public.bed_requests for select to authenticated
  using (tenant_id in (select private.member_tenant_ids())
         or requested_by_resident_id in (select private.my_resident_ids()));
grant select on public.bed_requests to authenticated;

-- update_bed learns the is_listed flag. Only a vacant, available bed can be listed;
-- a bed stops being shown on its own once someone is assigned to it.
create or replace function public.update_bed(p_bed_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bed public.beds;
begin
  select * into v_bed from public.beds b where b.id = p_bed_id;
  perform private.require_write(v_bed.tenant_id, private.r_ops());
  if coalesce((p_data ->> 'is_unavailable')::boolean, false)
     and exists (select 1 from public.stays s where s.bed_id = p_bed_id and s.status = 'active') then
    perform private.fail('This bed is occupied. Move the resident out before marking it unavailable.', 'bed_occupied');
  end if;
  if coalesce((p_data ->> 'is_listed')::boolean, false) then
    if exists (select 1 from public.stays s where s.bed_id = p_bed_id and s.status = 'active') then
      perform private.fail('This bed is occupied. Only vacant beds can be listed.', 'bed_occupied');
    end if;
    if coalesce((p_data ->> 'is_unavailable')::boolean, v_bed.is_unavailable) then
      perform private.fail('This bed is marked unavailable. Make it available before listing it.', 'validation');
    end if;
  end if;
  update public.beds b set
    label = case when p_data ? 'label' then coalesce(private.clean_text(p_data ->> 'label'), b.label) else b.label end,
    rent_paise = case when p_data ? 'rent_paise' then private.to_paise(p_data -> 'rent_paise', 'Bed rent') else b.rent_paise end,
    is_unavailable = case when p_data ? 'is_unavailable' then (p_data ->> 'is_unavailable')::boolean else b.is_unavailable end,
    unavailable_reason = case
      when p_data ? 'is_unavailable' and not (p_data ->> 'is_unavailable')::boolean then null
      when p_data ? 'unavailable_reason' then private.clean_text(p_data ->> 'unavailable_reason')
      else b.unavailable_reason end,
    is_listed = case
      when coalesce((p_data ->> 'is_unavailable')::boolean, false) then false
      when p_data ? 'is_listed' then (p_data ->> 'is_listed')::boolean
      else b.is_listed end
  where b.id = p_bed_id;
  perform private.audit(v_bed.tenant_id, 'bed.updated', 'bed', p_bed_id);
exception
  when unique_violation then
    perform private.fail('Another bed in this room already uses that label', 'duplicate');
end;
$$;

-- list_rooms also returns is_listed so the dashboard can show and toggle it.
create or replace function public.list_rooms(p_tenant_id uuid, p_property_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_role(p_tenant_id, private.r_all());
  return coalesce((
    select jsonb_agg(
             to_jsonb(r) || jsonb_build_object(
               'property_name', p.name,
               'beds', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', b.id,
                          'label', b.label,
                          'rent_paise', b.rent_paise,
                          'suggested_rent_paise', coalesce(
                            b.rent_paise,
                            case when r.rent_mode = 'per_bed' then r.rent_paise
                                 else round(r.rent_paise::numeric / greatest((select count(*) from public.beds x where x.room_id = r.id), 1))::bigint end),
                          'is_unavailable', b.is_unavailable,
                          'unavailable_reason', b.unavailable_reason,
                          'is_listed', b.is_listed and s.id is null and not b.is_unavailable,
                          'status', case when b.is_unavailable then 'unavailable' when s.id is not null then 'occupied' else 'vacant' end,
                          'occupant', case when s.id is not null then jsonb_build_object(
                            'stay_id', s.id, 'resident_id', s.resident_id, 'full_name', res.full_name, 'move_in_date', s.move_in_date) end
                        ) order by b.sort_order, b.label), '[]'::jsonb)
                   from public.beds b
                   left join public.stays s on s.bed_id = b.id and s.status = 'active'
                   left join public.residents res on res.id = s.resident_id
                  where b.room_id = r.id)
             ) order by p.name, char_length(r.name), r.name)
      from public.rooms r
      join public.properties p on p.id = r.property_id
     where r.tenant_id = p_tenant_id
       and p.status = 'active'
       and (p_property_id is null or r.property_id = p_property_id)), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Resident side
-- -----------------------------------------------------------------------------
-- Listed, vacant beds in the businesses the caller stays with, plus the
-- caller's own earlier requests.
create or replace function public.list_available_beds()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
begin
  return jsonb_build_object(
    'beds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'bed_id', b.id,
               'tenant_id', b.tenant_id,
               'bed_label', b.label,
               'room_name', r.name,
               'floor', r.floor,
               'category', r.category,
               'beds_in_room', (select count(*) from public.beds x where x.room_id = r.id),
               'amenities', r.amenities,
               'rent_paise', private.suggested_bed_rent(b.id),
               'deposit_paise', r.deposit_paise,
               'property_name', p.name,
               'gender_policy', p.gender_policy,
               'locality', p.locality,
               'city', p.city,
               'address', concat_ws(', ', p.address_line1, p.address_line2, p.locality, p.city)
             ) order by p.name, char_length(r.name), r.name, b.sort_order, b.label)
        from public.beds b
        join public.rooms r on r.id = b.room_id
        join public.properties p on p.id = b.property_id
        join public.tenants t on t.id = b.tenant_id
       where b.tenant_id in (select l.tenant_id from public.resident_user_links l where l.user_id = v_uid)
         and b.is_listed
         and not b.is_unavailable
         and r.is_active
         and p.status = 'active'
         and t.status not in ('suspended', 'cancelled')
         and not exists (select 1 from public.stays s where s.bed_id = b.id and s.status = 'active')), '[]'::jsonb),
    'my_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'bed_id', q.bed_id, 'friend_name', q.friend_name, 'friend_phone', q.friend_phone,
               'move_in_date', q.move_in_date, 'status', q.status, 'created_at', q.created_at,
               'room_name', r.name, 'bed_label', b.label
             ) order by q.created_at desc)
        from public.bed_requests q
        left join public.beds b on b.id = q.bed_id
        left join public.rooms r on r.id = b.room_id
       where q.requested_by_user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

-- p_data: { friend_name, friend_phone, move_in_date?, note? }
create or replace function public.request_bed(p_bed_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_bed public.beds;
  v_resident_id uuid;
  v_status public.tenant_status;
  v_name text := private.clean_text(p_data ->> 'friend_name');
  v_phone text := private.clean_text(p_data ->> 'friend_phone');
  v_note text := private.clean_text(p_data ->> 'note');
  v_move_in date;
  v_id uuid;
begin
  select * into v_bed from public.beds b where b.id = p_bed_id;
  select l.resident_id into v_resident_id
    from public.resident_user_links l
   where l.user_id = v_uid and l.tenant_id = v_bed.tenant_id
   limit 1;
  if v_bed.id is null or v_resident_id is null then
    raise exception 'Record not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  select t.status into v_status from public.tenants t where t.id = v_bed.tenant_id;
  if v_status in ('suspended', 'cancelled')
     or not v_bed.is_listed or v_bed.is_unavailable
     or exists (select 1 from public.stays s where s.bed_id = p_bed_id and s.status = 'active') then
    perform private.fail('This bed is no longer available.', 'bed_unavailable');
  end if;
  if v_name is null or char_length(v_name) < 2 then
    perform private.fail('Enter your friend''s name', 'validation');
  end if;
  perform private.check_phone(v_phone, 'Friend''s phone number');
  if v_phone is null then
    perform private.fail('Enter your friend''s phone number', 'validation');
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    perform private.fail('Keep the note under 500 characters', 'validation');
  end if;
  begin
    v_move_in := nullif(p_data ->> 'move_in_date', '')::date;
  exception when others then
    perform private.fail('Enter a valid move-in date', 'validation');
  end;
  if v_move_in is not null and v_move_in < private.today() then
    perform private.fail('Move-in date cannot be in the past', 'validation');
  end if;
  -- Light rate limit: at most 10 requests per resident per day.
  if (select count(*) from public.bed_requests q
       where q.requested_by_user_id = v_uid and q.created_at > now() - interval '1 day') >= 10 then
    perform private.fail('Too many requests today. Please try again tomorrow.', 'rate_limited');
  end if;

  insert into public.bed_requests (tenant_id, bed_id, requested_by_resident_id, requested_by_user_id,
                                   friend_name, friend_phone, move_in_date, note)
  values (v_bed.tenant_id, p_bed_id, v_resident_id, v_uid, v_name, v_phone, v_move_in, v_note)
  returning id into v_id;
  perform private.audit(v_bed.tenant_id, 'bed_request.created', 'bed_request', v_id,
                        jsonb_build_object('bed_id', p_bed_id, 'resident_id', v_resident_id));
  return v_id;
end;
$$;

create or replace function public.cancel_bed_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_auth();
  v_req public.bed_requests;
begin
  select * into v_req from public.bed_requests q where q.id = p_request_id and q.requested_by_user_id = v_uid;
  if v_req.id is null then
    raise exception 'Record not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_req.status <> 'new' then
    perform private.fail('The owner has already handled this request.', 'validation');
  end if;
  update public.bed_requests set status = 'cancelled' where id = p_request_id;
  perform private.audit(v_req.tenant_id, 'bed_request.cancelled', 'bed_request', p_request_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Owner side
-- -----------------------------------------------------------------------------
-- p_params: { status?: open|all }  (open = new + contacted)
create or replace function public.list_bed_requests(p_tenant_id uuid, p_params jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_open boolean := coalesce(p_params ->> 'status', 'open') = 'open';
begin
  perform private.require_role(p_tenant_id, private.r_ops());
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', q.id, 'status', q.status, 'friend_name', q.friend_name, 'friend_phone', q.friend_phone,
             'move_in_date', q.move_in_date, 'note', q.note, 'created_at', q.created_at,
             'bed_id', q.bed_id, 'bed_label', b.label, 'room_name', r.name, 'property_name', p.name,
             'bed_vacant', b.id is not null and not exists (select 1 from public.stays s where s.bed_id = b.id and s.status = 'active'),
             'referred_by', case when res.id is not null then jsonb_build_object('resident_id', res.id, 'full_name', res.full_name, 'phone', res.phone) end
           ) order by q.created_at desc)
      from public.bed_requests q
      left join public.beds b on b.id = q.bed_id
      left join public.rooms r on r.id = b.room_id
      left join public.properties p on p.id = b.property_id
      left join public.residents res on res.id = q.requested_by_resident_id
     where q.tenant_id = p_tenant_id
       and (not v_open or q.status in ('new', 'contacted'))), '[]'::jsonb);
end;
$$;

create or replace function public.update_bed_request(p_request_id uuid, p_status public.bed_request_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.bed_requests;
begin
  select * into v_req from public.bed_requests q where q.id = p_request_id;
  perform private.require_write(v_req.tenant_id, private.r_ops());
  if p_status is null or p_status = 'cancelled' then
    perform private.fail('Choose contacted, booked or declined', 'validation');
  end if;
  update public.bed_requests set status = p_status where id = p_request_id;
  perform private.audit(v_req.tenant_id, 'bed_request.updated', 'bed_request', p_request_id,
                        jsonb_build_object('status', p_status));
end;
$$;

revoke execute on function public.list_available_beds(), public.request_bed(uuid, jsonb), public.cancel_bed_request(uuid),
  public.list_bed_requests(uuid, jsonb), public.update_bed_request(uuid, public.bed_request_status) from public, anon;
grant execute on function public.list_available_beds(), public.request_bed(uuid, jsonb), public.cancel_bed_request(uuid),
  public.list_bed_requests(uuid, jsonb), public.update_bed_request(uuid, public.bed_request_status) to authenticated;
