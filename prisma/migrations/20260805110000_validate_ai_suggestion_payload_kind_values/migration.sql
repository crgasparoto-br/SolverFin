-- Issue #561 remediation: enforce the same kind-specific scalar constraints in
-- PostgreSQL that are already enforced by the domain parser.

create or replace function "isValidAiSuggestionPayloadPositiveSafeInteger"(value jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  numeric_value numeric;
begin
  if jsonb_typeof(value) is distinct from 'number' then
    return false;
  end if;

  numeric_value := (value #>> '{}')::numeric;
  return numeric_value > 0
    and numeric_value <= 9007199254740991
    and trunc(numeric_value) = numeric_value;
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
  date_text text;
  parsed_date date;
begin
  if not "isValidAiSuggestionPayloadString"(value) then
    return false;
  end if;

  date_text := value #>> '{}';
  if date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  parsed_date := date_text::date;
  return to_char(parsed_date, 'YYYY-MM-DD') = date_text;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return false;
end;
$$;

create or replace function "validateAiSuggestionPayloadKindValues"()
returns trigger
language plpgsql
as $$
declare
  payload jsonb := new."payload";
  payload_kind text;
  payload_version text;
begin
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or not (payload ? 'contractVersion')
  then
    return new;
  end if;

  if jsonb_typeof(payload->'contractVersion') is distinct from 'number'
    or payload->>'contractVersion' <> '1'
    or jsonb_typeof(payload->'suggestionKind') is distinct from 'string'
    or jsonb_typeof(payload->'payloadVersion') is distinct from 'number'
    or (payload ? 'confidence'
      and jsonb_typeof(payload->'confidence') is distinct from 'number')
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  payload_kind := payload->>'suggestionKind';
  payload_version := payload->>'payloadVersion';

  if payload_kind = 'transaction_extraction' then
    if not "isValidAiSuggestionPayloadPositiveSafeInteger"(payload->'sourceRowNumber')
      or not "isValidAiSuggestionPayloadString"(payload->'sourceHash')
      or not "isValidAiSuggestionPayloadIsoDate"(payload->'occurredOn')
      or not "isValidAiSuggestionPayloadPositiveSafeInteger"(payload->'amountMinor')
      or jsonb_typeof(payload->'currency') is distinct from 'string'
      or payload->>'currency' !~ '^[A-Z]{3}$'
      or not "isValidAiSuggestionPayloadString"(payload->'description')
      or (payload ? 'accountId'
        and not "isValidAiSuggestionPayloadString"(payload->'accountId'))
      or (payload ? 'otherAccountId'
        and not "isValidAiSuggestionPayloadString"(payload->'otherAccountId'))
      or (payload ? 'categoryId'
        and not "isValidAiSuggestionPayloadString"(payload->'categoryId'))
      or (payload ? 'externalId'
        and not "isValidAiSuggestionPayloadString"(payload->'externalId'))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;

    if payload_version = '1' then
      if jsonb_typeof(payload->'kind') is distinct from 'string'
        or payload->>'kind' not in ('income', 'expense')
        or payload ? 'direction'
        or payload ? 'otherAccountId'
      then
        raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
      end if;
    elsif payload_version = '2' then
      if jsonb_typeof(payload->'kind') is distinct from 'string'
        or payload->>'kind' not in ('income', 'expense', 'transfer')
        or jsonb_typeof(payload->'direction') is distinct from 'string'
        or payload->>'direction' not in ('inflow', 'outflow')
      then
        raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
      end if;
    end if;
  elsif payload_kind = 'categorization' then
    if not "isValidAiSuggestionPayloadString"(payload->'targetEntityId')
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
      or (payload ? 'sourceSuggestionId'
        and not "isValidAiSuggestionPayloadString"(payload->'sourceSuggestionId'))
      or (payload ? 'proposedStatus' and (
        jsonb_typeof(payload->'proposedStatus') is distinct from 'string'
        or payload->>'proposedStatus' not in (
          'pending_review', 'duplicate', 'planned', 'posted', 'reconciled',
          'suggested', 'voided'
        )
      ))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif payload_kind in ('deduplication', 'reconciliation') then
    if not "isValidAiSuggestionPayloadString"(payload->'sourceSuggestionId')
      or not "isValidAiSuggestionPayloadString"(payload->'sourcePayloadFingerprint')
      or not "isValidAiSuggestionPayloadString"(payload->'targetTransactionId')
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif payload_kind = 'insight' then
    if jsonb_typeof(payload->'insightType') is distinct from 'string'
      or payload->>'insightType' not in ('anomaly', 'trend', 'summary', 'opportunity')
      or not "isValidAiSuggestionPayloadString"(payload->'title')
      or not "isValidAiSuggestionPayloadString"(payload->'summary')
      or not "isValidAiSuggestionPayloadIsoDate"(payload->'periodStartOn')
      or not "isValidAiSuggestionPayloadIsoDate"(payload->'periodEndOn')
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  end if;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
end;
$$;

create trigger "ZlAiSuggestionPayloadKindValuesInsert"
before insert on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadKindValues"();

create trigger "ZlAiSuggestionPayloadKindValuesUpdate"
before update of "payload" on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadKindValues"();
