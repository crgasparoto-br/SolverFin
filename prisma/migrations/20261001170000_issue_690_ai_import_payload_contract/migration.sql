-- Issue #690: extend the strict AI suggestion contract for PDF/XLSX and card-purchase imports.
-- Keep the existing contract/immutability behavior and only add the new discriminated fields/origins.

create or replace function "validateAiSuggestionPayloadContract"()
returns trigger
language plpgsql
as $$
declare
  payload_kind text := lower(new."kind"::text);
  legacy_fingerprint text;
  inferred_origin jsonb;
  inferred_target jsonb;
  normalized_payload jsonb;
  old_payload_business jsonb;
  new_payload_business jsonb;
begin
  if tg_op = 'UPDATE' and old."status"::text <> 'PENDING_REVIEW' then
    raise exception using
      errcode = 'P0001',
      message = case
        when new."status" is distinct from old."status"
          then 'AI_SUGGESTION_PAYLOAD_CONFLICT'
        else 'AI_SUGGESTION_PAYLOAD_IMMUTABLE'
      end;
  end if;

  if tg_op = 'UPDATE'
    and old."payload" is null
    and new."payload" is null
    and old."status"::text = 'PENDING_REVIEW'
    and new."status"::text in ('REJECTED', 'EXPIRED')
  then
    return new;
  end if;

  if new."payload" is null then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_MISSING';
  end if;

  if jsonb_typeof(new."payload") <> 'object' then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if not (new."payload" ? 'contractVersion') then
    if payload_kind = 'transaction_extraction' then
      if not (
        new."payload" ? 'payloadVersion'
        and new."payload" ? 'sourceRowNumber'
        and new."payload" ? 'sourceHash'
        and new."payload" ? 'occurredOn'
        and new."payload" ? 'kind'
        and new."payload" ? 'amountMinor'
        and new."payload" ? 'currency'
        and new."payload" ? 'description'
      ) then
        raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
      end if;
      if (new."payload"->>'payloadVersion') not in ('1', '2') then
        raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED';
      end if;
    elsif payload_kind in ('deduplication', 'reconciliation') then
      if not (
        new."payload" ? 'payloadVersion'
        and new."payload" ? 'sourceSuggestionId'
        and new."payload" ? 'sourcePayloadFingerprint'
        and new."payload" ? 'targetTransactionId'
        and new."payload" ? 'reasons'
        and new."payload" ? 'conflicts'
      ) then
        raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
      end if;
      if new."payload"->>'payloadVersion' <> '1' then
        raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED';
      end if;
    else
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED';
    end if;

    legacy_fingerprint := 'db-fp-v1-' ||
      md5(new."payload"::text) ||
      md5('solverfin-ai-suggestion-v1:' || new."payload"::text);

    inferred_origin := case
      when coalesce(new."provider", '') like 'solverfin-import%'
        then jsonb_strip_nulls(jsonb_build_object(
          'kind', 'import',
          'sourceKind', case
            when coalesce(new."provider", '') like '%ofx%' then 'ofx'
            when coalesce(new."provider", '') like '%xlsx%' then 'xlsx'
            when coalesce(new."provider", '') like '%pdf%' then 'pdf'
            when coalesce(new."provider", '') like '%bank-message%' then 'bank_message'
            else 'csv'
          end,
          'sourceEntityId', new."sourceEntityId"
        ))
      when coalesce(new."provider", '') like 'solverfin-rule%'
        then jsonb_build_object('kind', 'rule')
      when coalesce(new."provider", '') like 'solverfin-automation%'
        then jsonb_build_object('kind', 'automation')
      when new."provider" is not null
        then jsonb_strip_nulls(jsonb_build_object(
          'kind', 'provider',
          'provider', new."provider",
          'model', new."model"
        ))
      else jsonb_build_object('kind', 'system', 'component', 'legacy-migration')
    end;

    inferred_target := jsonb_strip_nulls(jsonb_build_object(
      'entityKind', 'transaction',
      'entityId', case
        when payload_kind = 'transaction_extraction' then new."targetEntityId"::text
        else coalesce(new."targetEntityId"::text, new."payload"->>'targetTransactionId')
      end
    ));

    normalized_payload := new."payload" || jsonb_strip_nulls(jsonb_build_object(
      'contractVersion', 1,
      'suggestionKind', payload_kind,
      'origin', inferred_origin,
      'fingerprint', legacy_fingerprint,
      'target', inferred_target,
      'confidence', new."confidence",
      'reasons', coalesce(new."payload"->'reasons', '[]'::jsonb),
      'audit', jsonb_strip_nulls(jsonb_build_object(
        'createdAt', to_char(new."createdAt" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'sourceFingerprint', coalesce(
          new."payload"->>'sourcePayloadFingerprint',
          new."payloadFingerprint"
        )
      ))
    ));
    new."payload" := normalized_payload;
  end if;

  if new."payload"->>'contractVersion' <> '1' then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED';
  end if;

  if new."payload"->>'suggestionKind' is distinct from payload_kind then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_KIND_MISMATCH';
  end if;

  if jsonb_typeof(new."payload"->'origin') <> 'object'
    or jsonb_typeof(new."payload"->'target') <> 'object'
    or jsonb_typeof(new."payload"->'audit') <> 'object'
    or jsonb_typeof(new."payload"->'reasons') <> 'array'
    or coalesce(new."payload"->>'fingerprint', '') !~ '^(sha256|db-fp-v1)-[a-f0-9]{64}$'
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if new."payload" ? 'confidence' and
    ((new."payload"->>'confidence')::numeric < 0 or (new."payload"->>'confidence')::numeric > 1)
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if payload_kind <> 'transaction_extraction'
    and new."payload"->'target' ? 'entityId'
    and new."targetEntityId" is not null
    and new."payload"->'target'->>'entityId' is distinct from new."targetEntityId"::text
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_KIND_MISMATCH';
  end if;

  if payload_kind = 'transaction_extraction' then
    if (new."payload"->>'payloadVersion') not in ('1', '2')
      or not (new."payload" ?& array[
        'sourceRowNumber', 'sourceHash', 'occurredOn', 'kind',
        'amountMinor', 'currency', 'description'
      ])
      or exists (
        select 1 from jsonb_object_keys(new."payload") as key_name
        where key_name not in (
          'contractVersion', 'suggestionKind', 'origin', 'fingerprint', 'target',
          'confidence', 'reasons', 'audit', 'payloadVersion', 'sourceRowNumber',
          'sourceHash', 'occurredOn', 'kind', 'direction', 'amountMinor', 'currency',
          'description', 'accountId', 'otherAccountId', 'categoryId', 'externalId',
          'targetKind', 'cardId', 'cardInstrumentId', 'cardInstrumentHint',
          'invoicePeriod', 'installmentSequence', 'installmentTotal'
        )
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif payload_kind = 'categorization' then
    if new."payload"->>'payloadVersion' <> '1'
      or not (new."payload" ? 'targetEntityId')
      or not (
        new."payload" ? 'proposedCategoryId'
        or new."payload" ? 'proposedAccountId'
        or new."payload" ? 'proposedCardId'
        or new."payload" ? 'proposedStatus'
      )
      or exists (
        select 1 from jsonb_object_keys(new."payload") as key_name
        where key_name not in (
          'contractVersion', 'suggestionKind', 'origin', 'fingerprint', 'target',
          'confidence', 'reasons', 'audit', 'payloadVersion', 'targetEntityId',
          'targetTransactionId', 'proposedCategoryId', 'proposedAccountId',
          'proposedCardId', 'proposedStatus', 'previousCategoryId', 'sourceSuggestionId'
        )
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif payload_kind in ('deduplication', 'reconciliation') then
    if new."payload"->>'payloadVersion' <> '1'
      or not (new."payload" ?& array[
        'sourceSuggestionId', 'sourcePayloadFingerprint', 'targetTransactionId', 'conflicts'
      ])
      or jsonb_typeof(new."payload"->'conflicts') <> 'array'
      or exists (
        select 1 from jsonb_object_keys(new."payload") as key_name
        where key_name not in (
          'contractVersion', 'suggestionKind', 'origin', 'fingerprint', 'target',
          'confidence', 'reasons', 'audit', 'payloadVersion', 'sourceSuggestionId',
          'sourcePayloadFingerprint', 'targetTransactionId', 'conflicts'
        )
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  elsif payload_kind = 'insight' then
    if new."payload"->>'payloadVersion' <> '1'
      or not (new."payload" ?& array[
        'insightType', 'title', 'summary', 'periodStartOn', 'periodEndOn'
      ])
      or exists (
        select 1 from jsonb_object_keys(new."payload") as key_name
        where key_name not in (
          'contractVersion', 'suggestionKind', 'origin', 'fingerprint', 'target',
          'confidence', 'reasons', 'audit', 'payloadVersion', 'insightType', 'title',
          'summary', 'periodStartOn', 'periodEndOn', 'metric', 'relatedEntityIds'
        )
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_KIND_MISMATCH';
  end if;

  if tg_op = 'UPDATE' then
    old_payload_business := coalesce(old."payload", '{}'::jsonb) - 'fingerprint' - 'audit';
    new_payload_business := new."payload" - 'fingerprint' - 'audit';

    if (
      old."kind" is distinct from new."kind"
      or old."sourceEntityId" is distinct from new."sourceEntityId"
      or (
        old."targetEntityId" is distinct from new."targetEntityId"
        and not (
          payload_kind = 'transaction_extraction'
          and old."targetEntityId" is null
          and new."status"::text = 'APPROVED'
        )
      )
      or old_payload_business is distinct from new_payload_business
      or old."payload"->'audit'->>'sourceFingerprint'
        is distinct from new."payload"->'audit'->>'sourceFingerprint'
    ) and coalesce(old."payload"->>'fingerprint', '') = new."payload"->>'fingerprint'
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_OBSOLETE';
    end if;
  end if;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
end;
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
    if origin->>'sourceKind' not in ('csv', 'ofx', 'xlsx', 'pdf', 'bank_message', 'manual')
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
      or (payload ? 'targetKind' and (
        jsonb_typeof(payload->'targetKind') is distinct from 'string'
        or payload->>'targetKind' not in ('account', 'card')
      ))
      or (payload ? 'cardId'
        and not "isValidAiSuggestionPayloadString"(payload->'cardId'))
      or (payload ? 'cardInstrumentId'
        and not "isValidAiSuggestionPayloadString"(payload->'cardInstrumentId'))
      or (payload ? 'cardInstrumentHint'
        and not "isValidAiSuggestionPayloadString"(payload->'cardInstrumentHint'))
      or (payload ? 'invoicePeriod' and (
        jsonb_typeof(payload->'invoicePeriod') is distinct from 'string'
        or payload->>'invoicePeriod' !~ '^[0-9]{4}-[0-9]{2}$'
      ))
      or (payload ? 'installmentSequence'
        and not "isValidAiSuggestionPayloadPositiveSafeInteger"(payload->'installmentSequence'))
      or (payload ? 'installmentTotal'
        and not "isValidAiSuggestionPayloadPositiveSafeInteger"(payload->'installmentTotal'))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;

    if payload_version = '1' then
      if jsonb_typeof(payload->'kind') is distinct from 'string'
        or payload->>'kind' not in ('income', 'expense')
        or payload ? 'direction'
        or payload ? 'otherAccountId'
        or payload ? 'targetKind'
        or payload ? 'cardId'
        or payload ? 'cardInstrumentId'
        or payload ? 'cardInstrumentHint'
        or payload ? 'invoicePeriod'
        or payload ? 'installmentSequence'
        or payload ? 'installmentTotal'
      then
        raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
      end if;
    elsif payload_version = '2' then
      if jsonb_typeof(payload->'kind') is distinct from 'string'
        or payload->>'kind' not in ('income', 'expense', 'transfer')
        or jsonb_typeof(payload->'direction') is distinct from 'string'
        or payload->>'direction' not in ('inflow', 'outflow')
        or ((payload ? 'installmentSequence') <> (payload ? 'installmentTotal'))
        or (
          payload ? 'installmentSequence'
          and (payload->>'installmentSequence')::numeric > (payload->>'installmentTotal')::numeric
        )
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
