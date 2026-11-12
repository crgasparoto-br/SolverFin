-- Issue #561: canonical, discriminated and versioned AI suggestion payloads.
-- Existing legacy rows are intentionally not backfilled. A pending legacy row is
-- migrated only when a compatible mutation reaches this trigger.

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
          'description', 'accountId', 'otherAccountId', 'categoryId', 'externalId'
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

create trigger "AiSuggestionPayloadContractInsert"
before insert on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadContract"();

create trigger "AiSuggestionPayloadContractUpdate"
before update of "kind", "status", "sourceEntityId", "targetEntityId", "confidence", "payload" on "AiSuggestion"
for each row
execute function "validateAiSuggestionPayloadContract"();
