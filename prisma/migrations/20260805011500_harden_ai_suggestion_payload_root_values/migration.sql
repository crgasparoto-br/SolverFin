-- Issue #561 remediation: keep root payload values aligned with the domain parser.
-- Previous triggers validate the envelope, allowed keys and nested objects. This
-- follow-up rejects malformed scalar values before a canonical payload is stored.

create or replace function "isValidAiSuggestionPayloadPositiveSafeInteger"(value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  parsed numeric;
begin
  if jsonb_typeof(value) <> 'number' then
    return false;
  end if;

  parsed := (value #>> '{}')::numeric;
  return parsed = trunc(parsed)
    and parsed between 1 and 9007199254740991;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create or replace function "isValidAiSuggestionPayloadVersion"(
  value jsonb,
  allowed_versions integer[]
)
returns boolean
language plpgsql
immutable
as $$
declare
  parsed numeric;
begin
  if jsonb_typeof(value) <> 'number' then
    return false;
  end if;

  parsed := (value #>> '{}')::numeric;
  return parsed = trunc(parsed)
    and parsed::integer = any(allowed_versions);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create or replace function "isValidAiSuggestionPayloadIsoDate"(value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  text_value text;
  parsed date;
begin
  if jsonb_typeof(value) <> 'string' then
    return false;
  end if;

  text_value := value #>> '{}';
  if text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  parsed := text_value::date;
  return to_char(parsed, 'YYYY-MM-DD') = text_value;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return false;
end;
$$;

create or replace function "validateAiSuggestionPayloadRootValues"()
returns trigger
language plpgsql
as $$
declare
  payload jsonb := new."payload";
  payload_kind text;
  payload_version integer;
begin
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or not (payload ? 'contractVersion')
  then
    return new;
  end if;

  if not "isValidAiSuggestionPayloadVersion"(payload->'contractVersion', array[1])
    or jsonb_typeof(payload->'suggestionKind') <> 'string'
    or not "isValidAiSuggestionPayloadVersion"(payload->'payloadVersion', array[1, 2])
    or (payload ? 'confidence' and jsonb_typeof(payload->'confidence') <> 'number')
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  payload_kind := payload->>'suggestionKind';
  payload_version := (payload->>'payloadVersion')::integer;

  if payload_kind = 'transaction_extraction' then
    if not "isValidAiSuggestionPayloadPositiveSafeInteger"(payload->'sourceRowNumber')
      or not "isValidAiSuggestionPayloadString"(payload->'sourceHash')
      or not "isValidAiSuggestionPayloadIsoDate"(payload->'occurredOn')
      or not "isValidAiSuggestionPayloadPositiveSafeInteger"(payload->'amountMinor')
      or jsonb_typeof(payload->'currency') <> 'string'
      or payload->>'currency' !~ '^[A-Z]{3}$'
      or not "isValidAiSuggestionPayloadString"(payload->'description')
      or (payload ? 'accountId'
        and not "isValidAiSuggestionPayloadString"(payload->'accountId'))
      or (payload ? 'categoryId'
        and not "isValidAiSuggestionPayloadString"(payload->'categoryId'))
      or (payload ? 'externalId'
        and not "isValidAiSuggestionPayloadString"(payload->'externalId'))
      or (payload_version = 1 and (
        coalesce(payload->>'kind', '') not in ('income', 'expense')
        or payload ? 'direction'
        or payload ? 'otherAccountId'
      ))
      or (payload_version = 2 and (
        coalesce(payload->>'kind', '') not in ('income', 'expense', 'transfer')
        or coalesce(payload->>'direction', '') not in ('inflow', 'outflow')
        or (payload ? 'otherAccountId'
          and not "isValidAiSuggestionPayloadString"(payload->'otherAccountId'))
      ))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif payload_kind = 'categorization' then
    if payload_version <> 1
      or not "isValidAiSuggestionPayloadString"(payload->'targetEntityId')
      or (payload ? 'targetTransactionId'
        and not "isValidAiSuggestionPayloadString"(payload->'targetTransactionId'))
      or (payload ? 'proposedCategoryId'
        and not "isValidAiSuggestionPayloadString"(payload->'proposedCategoryId'))
      or (payload ? 'proposedAccountId'
        and not "isValidAiSuggestionPayloadString"(payload->'proposedAccountId'))
      or (payload ? 'proposedCardId'
        and not "isValidAiSuggestionPayloadString"(payload->'proposedCardId'))
      or (payload ? 'previousCategoryId'
        and not "isValidAiSuggestionPayloadString"(payload->'previousCategoryId'))
      or (payload ? 'proposedStatus' and (
        jsonb_typeof(payload->'proposedStatus') <> 'string'
        or coalesce(payload->>'proposedStatus', '') not in (
          'pending_review', 'duplicate', 'planned', 'posted',
          'reconciled', 'suggested', 'voided'
        )
      ))
      or (payload ? 'sourceSuggestionId' and (
        not "isValidAiSuggestionPayloadString"(payload->'sourceSuggestionId')
        or not "isValidAiSuggestionPayloadString"(
          payload->'audit'->'sourceFingerprint'
        )
      ))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif payload_kind in ('deduplication', 'reconciliation') then
    if payload_version <> 1
      or not "isValidAiSuggestionPayloadString"(payload->'sourceSuggestionId')
      or not "isValidAiSuggestionPayloadString"(payload->'sourcePayloadFingerprint')
      or not "isValidAiSuggestionPayloadString"(payload->'targetTransactionId')
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif payload_kind = 'insight' then
    if payload_version <> 1
      or jsonb_typeof(payload->'insightType') <> 'string'
      or coalesce(payload->>'insightType', '') not in (
        'anomaly', 'trend', 'summary', 'opportunity'
      )
      or not "isValidAiSuggestionPayloadString"(payload->'title')
      or not "isValidAiSuggestionPayloadString"(payload->'summary')
      or not "isValidAiSuggestionPayloadIsoDate"(payload->'periodStartOn')
      or not "isValidAiSuggestionPayloadIsoDate"(payload->'periodEndOn')
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_KIND_MISMATCH';
  end if;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
end;
$$;

create trigger "ZhAiSuggestionPayloadRootValuesInsert"
before insert on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadRootValues"();

create trigger "ZhAiSuggestionPayloadRootValuesUpdate"
before update of "payload" on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadRootValues"();
