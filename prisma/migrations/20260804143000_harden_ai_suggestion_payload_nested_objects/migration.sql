-- Issue #561 remediation: keep database validation as strict as the domain parser.
-- The canonical trigger runs first (Ai*) and this follow-up trigger rejects
-- unknown or malformed fields inside nested payload objects.

create or replace function "validateAiSuggestionPayloadNestedObjects"()
returns trigger
language plpgsql
as $$
declare
  payload jsonb := new."payload";
  origin jsonb;
  target jsonb;
  audit jsonb;
  metric jsonb;
  origin_kind text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return new;
  end if;

  -- Legacy payloads are normalized by validateAiSuggestionPayloadContract first.
  if not (payload ? 'contractVersion') then
    return new;
  end if;

  origin := payload->'origin';
  target := payload->'target';
  audit := payload->'audit';

  if jsonb_typeof(origin) <> 'object'
    or jsonb_typeof(target) <> 'object'
    or jsonb_typeof(audit) <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  origin_kind := origin->>'kind';
  if origin_kind = 'provider' then
    if not (origin ? 'provider')
      or exists (
        select 1 from jsonb_object_keys(origin) as key_name
        where key_name not in ('kind', 'provider', 'model')
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif origin_kind = 'import' then
    if not (origin ? 'sourceKind')
      or exists (
        select 1 from jsonb_object_keys(origin) as key_name
        where key_name not in ('kind', 'sourceKind', 'sourceEntityId')
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif origin_kind in ('rule', 'automation') then
    if exists (
      select 1 from jsonb_object_keys(origin) as key_name
      where key_name not in ('kind', 'ruleId')
    )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif origin_kind = 'system' then
    if not (origin ? 'component')
      or exists (
        select 1 from jsonb_object_keys(origin) as key_name
        where key_name not in ('kind', 'component')
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if not (target ? 'entityKind')
    or exists (
      select 1 from jsonb_object_keys(target) as key_name
      where key_name not in ('entityKind', 'entityId')
    )
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if not (audit ? 'createdAt')
    or exists (
      select 1 from jsonb_object_keys(audit) as key_name
      where key_name not in ('createdAt', 'correlationId', 'sourceFingerprint')
    )
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if payload ? 'metric' then
    metric := payload->'metric';
    if jsonb_typeof(metric) <> 'object'
      or not (metric ?& array['name', 'value', 'unit'])
      or exists (
        select 1 from jsonb_object_keys(metric) as key_name
        where key_name not in ('name', 'value', 'unit', 'currency')
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  end if;

  if jsonb_typeof(payload->'reasons') <> 'array'
    or exists (
      select 1 from jsonb_array_elements(payload->'reasons') as item
      where jsonb_typeof(item) <> 'string'
    )
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if payload ? 'conflicts' and (
    jsonb_typeof(payload->'conflicts') <> 'array'
    or exists (
      select 1 from jsonb_array_elements(payload->'conflicts') as item
      where jsonb_typeof(item) <> 'string'
    )
  ) then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if payload ? 'relatedEntityIds' and (
    jsonb_typeof(payload->'relatedEntityIds') <> 'array'
    or exists (
      select 1 from jsonb_array_elements(payload->'relatedEntityIds') as item
      where jsonb_typeof(item) <> 'string'
    )
  ) then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  return new;
end;
$$;

create trigger "ZiSuggestionPayloadNestedContractInsert"
before insert on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadNestedObjects"();

create trigger "ZiSuggestionPayloadNestedContractUpdate"
before update of "payload" on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadNestedObjects"();
