-- Issue #561 remediation: repositories may expose a legacy-shaped view of a
-- current flat envelope while processing a terminal review decision. Preserve
-- the already validated canonical payload instead of re-normalizing that view.
-- Pending edits remain untouched and continue to require a new fingerprint.

create or replace function "preserveCurrentAiSuggestionPayloadOnResolution"()
returns trigger
language plpgsql
as $$
begin
  if old."status"::text = 'PENDING_REVIEW'
    and new."status" is distinct from old."status"
    and jsonb_typeof(old."payload") = 'object'
    and old."payload" ? 'contractVersion'
    and jsonb_typeof(new."payload") = 'object'
    and not (new."payload" ? 'contractVersion')
  then
    new."payload" := old."payload";
  end if;

  return new;
end;
$$;

create trigger "AaPreserveCurrentAiSuggestionPayloadUpdate"
before update of "status", "targetEntityId", "payload" on "AiSuggestion"
for each row
execute function "preserveCurrentAiSuggestionPayloadOnResolution"();
