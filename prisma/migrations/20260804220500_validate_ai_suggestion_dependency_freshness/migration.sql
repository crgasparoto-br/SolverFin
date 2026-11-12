-- Issue #561 remediation: dependent suggestions must still reference the
-- exact source payload that was reviewed when they were created.

create or replace function "validateAiSuggestionDependencyFreshness"()
returns trigger
language plpgsql
as $$
declare
  payload_kind text;
  source_suggestion_id_text text;
  expected_source_fingerprint text;
  actual_source_fingerprint text;
  source_found boolean := false;
begin
  if old."status"::text <> 'PENDING_REVIEW'
    or new."status"::text not in ('APPROVED', 'EDITED')
    or new."payload" is null
    or jsonb_typeof(new."payload") <> 'object'
    or not (new."payload" ? 'contractVersion')
  then
    return new;
  end if;

  payload_kind := new."payload"->>'suggestionKind';
  if payload_kind not in ('categorization', 'deduplication', 'reconciliation') then
    return new;
  end if;

  source_suggestion_id_text := nullif(new."payload"->>'sourceSuggestionId', '');
  if source_suggestion_id_text is null then
    -- Categorization can target a transaction directly. Only proposals with an
    -- explicit source suggestion and source fingerprint are freshness-bound.
    if payload_kind = 'categorization' then
      return new;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  if source_suggestion_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or source_suggestion_id_text::uuid = new."id"
  then
    raise exception using
      errcode = 'P0001',
      message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  expected_source_fingerprint := nullif(
    new."payload"->'audit'->>'sourceFingerprint',
    ''
  );
  if expected_source_fingerprint is null
    and payload_kind in ('deduplication', 'reconciliation')
  then
    expected_source_fingerprint := nullif(
      new."payload"->>'sourcePayloadFingerprint',
      ''
    );
  end if;

  if expected_source_fingerprint is null then
    -- Categorization may retain a sourceSuggestionId only for traceability. It
    -- becomes freshness-bound only when the observed source fingerprint is
    -- present. Deterministic deduplication/reconciliation always require it.
    if payload_kind = 'categorization' then
      return new;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  select case
           when payload_kind = 'categorization'
             then source."payload"->>'fingerprint'
           else coalesce(source."payloadFingerprint", source."payload"->>'fingerprint')
         end,
         true
    into actual_source_fingerprint, source_found
    from "AiSuggestion" as source
   where source."id" = source_suggestion_id_text::uuid
     and source."organizationId" = new."organizationId"
     and source."financialProfileId" = new."financialProfileId"
   for share;

  if not coalesce(source_found, false)
    or actual_source_fingerprint is null
    or actual_source_fingerprint is distinct from expected_source_fingerprint
  then
    raise exception using
      errcode = 'P0001',
      message = 'AI_SUGGESTION_PAYLOAD_OBSOLETE';
  end if;

  return new;
end;
$$;

create trigger "ZkAiSuggestionDependencyFreshnessUpdate"
before update of "status", "payload" on "AiSuggestion"
for each row
execute function "validateAiSuggestionDependencyFreshness"();
