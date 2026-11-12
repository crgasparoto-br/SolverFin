-- Issue #621: actionable financial insight queue.
--
-- * `RESOLVED` is an explicit user decision over one insight snapshot
--   (`dataFingerprint`). It is terminal and distinct from APPROVED, REJECTED,
--   EDITED and EXPIRED; the existing payload triggers already reject any status
--   or payload change once a row leaves PENDING_REVIEW.
-- * `snoozedUntil` temporarily hides one pending insight snapshot. It is bound
--   to the row (and therefore to its `dataFingerprint`), never to a broad key.
-- * Insight payload V2 accepts the detector `severity` and the canonical #617
--   projection slice (`referenceDate` + `horizonDays`) on `cash_flow`
--   navigation. Both fields are optional so snapshots persisted before #621
--   remain readable.

ALTER TYPE "AiSuggestionStatus" ADD VALUE IF NOT EXISTS 'RESOLVED';

ALTER TABLE "AiSuggestion" ADD COLUMN "snoozedUntil" TIMESTAMP(3);

ALTER TABLE "AiSuggestion"
  ADD CONSTRAINT "AiSuggestion_resolved_only_insight_check"
  CHECK ("status"::text <> 'RESOLVED' OR "kind"::text = 'INSIGHT');

ALTER TABLE "AiSuggestion"
  ADD CONSTRAINT "AiSuggestion_snoozed_only_insight_check"
  CHECK ("snoozedUntil" IS NULL OR "kind"::text = 'INSIGHT');

create or replace function "validateAiSuggestionInsightPayloadV2"()
returns trigger
language plpgsql
as $$
declare
  payload jsonb := new."payload";
  filters jsonb;
  evidence_item jsonb;
  comparison jsonb;
  navigation jsonb;
  old_payload_business jsonb;
  new_payload_business jsonb;
begin
  if lower(new."kind"::text) <> 'insight'
    or payload is null
    or jsonb_typeof(payload) <> 'object'
    or payload->>'payloadVersion' <> '2'
  then
    return new;
  end if;

  if tg_op = 'UPDATE' and old."status"::text <> 'PENDING_REVIEW' then
    raise exception using
      errcode = 'P0001',
      message = case
        when new."status" is distinct from old."status"
          then 'AI_SUGGESTION_PAYLOAD_CONFLICT'
        else 'AI_SUGGESTION_PAYLOAD_IMMUTABLE'
      end;
  end if;

  if jsonb_typeof(payload->'contractVersion') is distinct from 'number'
    or payload->>'contractVersion' <> '1'
    or jsonb_typeof(payload->'suggestionKind') is distinct from 'string'
    or payload->>'suggestionKind' <> 'insight'
    or jsonb_typeof(payload->'payloadVersion') is distinct from 'number'
    or coalesce(payload->>'fingerprint', '') !~ '^sha256-[a-f0-9]{64}$'
    or jsonb_typeof(payload->'origin') is distinct from 'object'
    or jsonb_typeof(payload->'target') is distinct from 'object'
    or jsonb_typeof(payload->'audit') is distinct from 'object'
    or jsonb_typeof(payload->'reasons') is distinct from 'array'
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if payload ? 'confidence' and (
    jsonb_typeof(payload->'confidence') is distinct from 'number'
    or (payload->>'confidence')::numeric < 0
    or (payload->>'confidence')::numeric > 1
  ) then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if exists (
    select 1 from jsonb_object_keys(payload) as key_name
    where key_name not in (
      'contractVersion', 'suggestionKind', 'origin', 'fingerprint', 'target',
      'confidence', 'reasons', 'audit', 'payloadVersion', 'insightType', 'insightKind',
      'insightKey', 'severity', 'title', 'summary', 'periodStartOn', 'periodEndOn', 'currency',
      'filters', 'evidence', 'comparison', 'limitations', 'calculationVersion',
      'dataFingerprint', 'relatedEntityIds', 'navigation'
    )
  ) then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if not (payload ?& array[
      'insightType', 'insightKind', 'insightKey', 'title', 'summary',
      'periodStartOn', 'periodEndOn', 'currency', 'filters', 'evidence',
      'limitations', 'calculationVersion', 'dataFingerprint'
    ])
    or jsonb_typeof(payload->'insightType') is distinct from 'string'
    or payload->>'insightType' not in ('anomaly', 'trend', 'summary', 'opportunity')
    or jsonb_typeof(payload->'insightKind') is distinct from 'string'
    or payload->>'insightKind' not in (
      'category_spending_increase', 'merchant_spending_increase', 'probable_subscription',
      'negative_balance_risk', 'budget_exceeded', 'monthly_summary'
    )
    or not "isValidAiSuggestionPayloadString"(payload->'insightKey')
    or not "isValidAiSuggestionPayloadString"(payload->'title')
    or not "isValidAiSuggestionPayloadString"(payload->'summary')
    or not "isValidAiSuggestionPayloadIsoDate"(payload->'periodStartOn')
    or not "isValidAiSuggestionPayloadIsoDate"(payload->'periodEndOn')
    or payload->>'periodStartOn' > payload->>'periodEndOn'
    or jsonb_typeof(payload->'currency') is distinct from 'string'
    or payload->>'currency' !~ '^[A-Z]{3}$'
    or not "isValidAiSuggestionPayloadString"(payload->'calculationVersion')
    or jsonb_typeof(payload->'dataFingerprint') is distinct from 'string'
    or payload->>'dataFingerprint' !~ '^sha256-[a-f0-9]{64}$'
    or (
      payload ? 'severity'
      and (
        jsonb_typeof(payload->'severity') is distinct from 'string'
        or payload->>'severity' not in ('info', 'warning', 'critical')
      )
    )
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  filters := payload->'filters';
  if jsonb_typeof(filters) is distinct from 'object'
    or jsonb_typeof(filters->'currency') is distinct from 'string'
    or filters->>'currency' is distinct from payload->>'currency'
    or exists (
      select 1 from jsonb_object_keys(filters) as key_name
      where key_name not in ('currency', 'categoryId', 'merchantKey')
    )
    or (filters ? 'categoryId' and not "isValidAiSuggestionPayloadString"(filters->'categoryId'))
    or (filters ? 'merchantKey' and not "isValidAiSuggestionPayloadString"(filters->'merchantKey'))
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if jsonb_typeof(payload->'evidence') is distinct from 'array'
    or jsonb_array_length(payload->'evidence') < 1
    or jsonb_array_length(payload->'evidence') > 20
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  for evidence_item in select value from jsonb_array_elements(payload->'evidence') loop
    if jsonb_typeof(evidence_item) is distinct from 'object'
      or not (evidence_item ?& array['label', 'value', 'unit'])
      or exists (
        select 1 from jsonb_object_keys(evidence_item) as key_name
        where key_name not in ('label', 'value', 'unit', 'currency')
      )
      or not "isValidAiSuggestionPayloadString"(evidence_item->'label')
      or jsonb_typeof(evidence_item->'value') is distinct from 'number'
      or jsonb_typeof(evidence_item->'unit') is distinct from 'string'
      or evidence_item->>'unit' not in ('minor_currency', 'count', 'percentage')
      or (
        evidence_item->>'unit' = 'minor_currency'
        and (
          jsonb_typeof(evidence_item->'currency') is distinct from 'string'
          or evidence_item->>'currency' is distinct from payload->>'currency'
          or trunc((evidence_item->>'value')::numeric) <> (evidence_item->>'value')::numeric
          or abs((evidence_item->>'value')::numeric) > 9007199254740991
        )
      )
      or (
        evidence_item->>'unit' = 'count'
        and (
          evidence_item ? 'currency'
          or (evidence_item->>'value')::numeric < 0
          or trunc((evidence_item->>'value')::numeric) <> (evidence_item->>'value')::numeric
        )
      )
      or (evidence_item->>'unit' = 'percentage' and evidence_item ? 'currency')
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  end loop;

  if jsonb_typeof(payload->'limitations') is distinct from 'array'
    or jsonb_array_length(payload->'limitations') > 20
    or exists (
      select 1 from jsonb_array_elements(payload->'limitations') as item
      where not "isValidAiSuggestionPayloadString"(item)
    )
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if payload ? 'comparison' then
    comparison := payload->'comparison';
    if jsonb_typeof(comparison) is distinct from 'object'
      or not (comparison ?& array['kind', 'currentValue', 'previousValue', 'unit'])
      or exists (
        select 1 from jsonb_object_keys(comparison) as key_name
        where key_name not in (
          'kind', 'currentValue', 'previousValue', 'unit', 'percentChange',
          'previousPeriodStartOn', 'previousPeriodEndOn'
        )
      )
      or jsonb_typeof(comparison->'kind') is distinct from 'string'
      or comparison->>'kind' not in ('previous_period', 'planned_budget')
      or jsonb_typeof(comparison->'currentValue') is distinct from 'number'
      or jsonb_typeof(comparison->'previousValue') is distinct from 'number'
      or jsonb_typeof(comparison->'unit') is distinct from 'string'
      or comparison->>'unit' not in ('minor_currency', 'count', 'percentage')
      or (comparison ? 'percentChange' and jsonb_typeof(comparison->'percentChange') is distinct from 'number')
      or ((comparison ? 'previousPeriodStartOn') <> (comparison ? 'previousPeriodEndOn'))
      or (comparison ? 'previousPeriodStartOn' and not "isValidAiSuggestionPayloadIsoDate"(comparison->'previousPeriodStartOn'))
      or (comparison ? 'previousPeriodEndOn' and not "isValidAiSuggestionPayloadIsoDate"(comparison->'previousPeriodEndOn'))
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  end if;

  if payload ? 'navigation' then
    navigation := payload->'navigation';
    if jsonb_typeof(navigation) is distinct from 'object'
      or jsonb_typeof(navigation->'view') is distinct from 'string'
      or navigation->>'view' not in ('transactions', 'budgets', 'cash_flow')
      or exists (
        select 1 from jsonb_object_keys(navigation) as key_name
        where key_name not in ('view', 'categoryId', 'merchantKey', 'referenceDate', 'horizonDays')
      )
      or (navigation ? 'categoryId' and not "isValidAiSuggestionPayloadString"(navigation->'categoryId'))
      or (navigation ? 'merchantKey' and not "isValidAiSuggestionPayloadString"(navigation->'merchantKey'))
      or ((navigation ? 'referenceDate') <> (navigation ? 'horizonDays'))
      or (navigation ? 'referenceDate' and navigation->>'view' <> 'cash_flow')
      or (navigation ? 'referenceDate' and not "isValidAiSuggestionPayloadIsoDate"(navigation->'referenceDate'))
      or (
        navigation ? 'horizonDays'
        and (
          jsonb_typeof(navigation->'horizonDays') is distinct from 'number'
          or navigation->>'horizonDays' not in ('30', '60', '90')
        )
      )
    then
      raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
    end if;
  end if;

  if payload ? 'relatedEntityIds' and (
    jsonb_typeof(payload->'relatedEntityIds') is distinct from 'array'
    or jsonb_array_length(payload->'relatedEntityIds') > 100
    or exists (
      select 1 from jsonb_array_elements(payload->'relatedEntityIds') as item
      where not "isValidAiSuggestionPayloadString"(item)
    )
  ) then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if new."targetEntityId" is not null
    and payload->'target' ? 'entityId'
    and payload->'target'->>'entityId' is distinct from new."targetEntityId"::text
  then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_KIND_MISMATCH';
  end if;

  if tg_op = 'UPDATE' then
    old_payload_business := coalesce(old."payload", '{}'::jsonb) - 'fingerprint' - 'audit';
    new_payload_business := payload - 'fingerprint' - 'audit';
    if (
      old."kind" is distinct from new."kind"
      or old."sourceEntityId" is distinct from new."sourceEntityId"
      or old."targetEntityId" is distinct from new."targetEntityId"
      or old_payload_business is distinct from new_payload_business
      or old."payload"->'audit'->>'sourceFingerprint'
        is distinct from payload->'audit'->>'sourceFingerprint'
    ) and coalesce(old."payload"->>'fingerprint', '') = payload->>'fingerprint'
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
