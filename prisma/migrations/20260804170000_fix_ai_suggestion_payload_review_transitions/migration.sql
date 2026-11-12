-- Issue #561 remediation: preserve canonical payloads during approval and
-- materialize payload dependencies in relational columns.

create or replace function "preserveCanonicalAiSuggestionPayloadOnApproval"()
returns trigger
language plpgsql
as $$
begin
  if old."status"::text = 'PENDING_REVIEW'
    and new."status"::text = 'APPROVED'
    and lower(new."kind"::text) = 'transaction_extraction'
    and old."targetEntityId" is null
    and new."targetEntityId" is not null
    and jsonb_typeof(old."payload") = 'object'
    and old."payload" ? 'contractVersion'
    and jsonb_typeof(new."payload") = 'object'
    and not (new."payload" ? 'contractVersion')
  then
    -- Legacy repository mappers still project the transaction proposal before
    -- persisting the terminal status. Keep the already validated envelope so
    -- the target column can change without fabricating a different proposal.
    new."payload" := old."payload";
  end if;

  return new;
end;
$$;

create trigger "AaAiSuggestionPayloadApprovalCompatibility"
before update of "status", "targetEntityId", "payload" on "AiSuggestion"
for each row
execute function "preserveCanonicalAiSuggestionPayloadOnApproval"();

create or replace function "synchronizeAiSuggestionPayloadRelations"()
returns trigger
language plpgsql
as $$
declare
  source_suggestion_id text;
  payload_kind text;
begin
  if new."payload" is null
    or jsonb_typeof(new."payload") <> 'object'
    or not (new."payload" ? 'contractVersion')
  then
    return new;
  end if;

  payload_kind := new."payload"->>'suggestionKind';
  if payload_kind not in ('categorization', 'deduplication', 'reconciliation') then
    return new;
  end if;

  source_suggestion_id := nullif(new."payload"->>'sourceSuggestionId', '');
  if source_suggestion_id is null then
    new."sourceSuggestionId" := null;
    return new;
  end if;

  if source_suggestion_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'AI_SUGGESTION_PAYLOAD_INVALID';
  end if;

  new."sourceSuggestionId" := source_suggestion_id::uuid;
  return new;
end;
$$;

create trigger "YiAiSuggestionPayloadRelationsInsert"
before insert on "AiSuggestion"
for each row
execute function "synchronizeAiSuggestionPayloadRelations"();

create trigger "YiAiSuggestionPayloadRelationsUpdate"
before update of "payload" on "AiSuggestion"
for each row
execute function "synchronizeAiSuggestionPayloadRelations"();

update "AiSuggestion"
set "sourceSuggestionId" = ("payload"->>'sourceSuggestionId')::uuid
where "sourceSuggestionId" is null
  and jsonb_typeof("payload") = 'object'
  and "payload" ? 'contractVersion'
  and "payload"->>'suggestionKind' in ('categorization', 'deduplication', 'reconciliation')
  and coalesce("payload"->>'sourceSuggestionId', '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
