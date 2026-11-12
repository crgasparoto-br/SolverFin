-- Issue #561 remediation: align persisted nested values with the domain parser.
-- The previous trigger rejects unknown nested keys; this follow-up validates
-- enums, scalar types, bounded strings, arrays and timestamps.

create or replace function "isValidAiSuggestionPayloadString"(value jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(value) = 'string'
      and length(value #>> '{}') between 1 and 2048,
    false
  );
$$;

create or replace function "validateAiSuggestionPayloadNestedValues"()
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
  created_at_text text;
begin
  if tg_op = 'UPDATE'
    and old."status"::text = 'PENDING_REVIEW'
    and new."status"::text = 'EDITED'
    and new."payload" is not distinct from old."payload"
  then
    raise exception using
      errcode = 'P0001',
      message = 'AI_SUGGESTION_PAYLOAD_KIND_MISMATCH';
  end if;

  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or not (payload ? 'contractVersion')
  then
    return new;
  end if;

  origin := payload->'origin';
  target := payload->'target';
  audit := payload->'audit';
  origin_kind := origin->>'kind';

  if origin_kind = 'provider' then
    if not "isValidAiSuggestionPayloadString"(origin->'provider')
      or (origin ? 'model' and not "isValidAiSuggestionPayloadString"(origin->'model'))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif origin_kind = 'import' then
    if origin->>'sourceKind' not in ('csv', 'ofx', 'bank_message', 'manual')
      or (origin ? 'sourceEntityId'
        and not "isValidAiSuggestionPayloadString"(origin->'sourceEntityId'))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif origin_kind in ('rule', 'automation') then
    if origin ? 'ruleId' and not "isValidAiSuggestionPayloadString"(origin->'ruleId') then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif origin_kind = 'system' then
    if not "isValidAiSuggestionPayloadString"(origin->'component') then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if target->>'entityKind' not in (
    'transaction', 'category', 'account', 'card', 'import_suggestion',
    'financial_profile', 'period'
  ) or (target ? 'entityId'
    and not "isValidAiSuggestionPayloadString"(target->'entityId'))
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if not "isValidAiSuggestionPayloadString"(audit->'createdAt')
    or (audit ? 'correlationId'
      and not "isValidAiSuggestionPayloadString"(audit->'correlationId'))
    or (audit ? 'sourceFingerprint'
      and not "isValidAiSuggestionPayloadString"(audit->'sourceFingerprint'))
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  created_at_text := audit->>'createdAt';
  if created_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;
  perform created_at_text::timestamptz;

  if payload ? 'metric' then
    metric := payload->'metric';
    if not "isValidAiSuggestionPayloadString"(metric->'name')
      or jsonb_typeof(metric->'value') <> 'number'
      or metric->>'unit' not in ('minor_currency', 'count', 'percentage')
      or (metric ? 'currency' and (
        jsonb_typeof(metric->'currency') <> 'string'
        or metric->>'currency' !~ '^[A-Z]{3}$'
      ))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
    perform (metric->>'value')::double precision;
  end if;

  if jsonb_array_length(payload->'reasons') > 100
    or exists (
      select 1 from jsonb_array_elements(payload->'reasons') as item
      where not "isValidAiSuggestionPayloadString"(item)
    )
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if payload ? 'conflicts' and (
    jsonb_array_length(payload->'conflicts') > 100
    or exists (
      select 1 from jsonb_array_elements(payload->'conflicts') as item
      where not "isValidAiSuggestionPayloadString"(item)
    )
  ) then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if payload ? 'relatedEntityIds' and (
    jsonb_array_length(payload->'relatedEntityIds') > 100
    or exists (
      select 1 from jsonb_array_elements(payload->'relatedEntityIds') as item
      where not "isValidAiSuggestionPayloadString"(item)
    )
  ) then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  return new;
exception
  when invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
end;
$$;

create trigger "ZjAiSuggestionPayloadNestedValuesInsert"
before insert on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadNestedValues"();

create trigger "ZjAiSuggestionPayloadNestedValuesUpdate"
before update of "payload" on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadNestedValues"();
