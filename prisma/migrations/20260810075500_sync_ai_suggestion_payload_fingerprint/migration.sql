-- Issue #565 remediation: keep AiSuggestion.payloadFingerprint synchronized
-- whenever a transaction_extraction payload changes. The deterministic import
-- fingerprint uses the same FNV-1a/UTF-16 semantics as @solverfin/domain.

create or replace function "fnv1a32Utf16"(value text)
returns text
language plpgsql
immutable
strict
as $$
declare
  hash_value bigint := 2166136261;
  index_value integer;
  code_point integer;
  code_unit integer;
  character_value text;
begin
  for index_value in 1..char_length(value) loop
    character_value := substr(value, index_value, 1);
    code_point := ascii(character_value);

    if code_point <= 65535 then
      hash_value := ((hash_value # code_point::bigint) * 16777619) % 4294967296;
    else
      code_unit := 55296 + ((code_point - 65536) >> 10);
      hash_value := ((hash_value # code_unit::bigint) * 16777619) % 4294967296;
      code_unit := 56320 + ((code_point - 65536) & 1023);
      hash_value := ((hash_value # code_unit::bigint) * 16777619) % 4294967296;
    end if;
  end loop;

  return 'fnv1a-' || lpad(to_hex(hash_value), 8, '0');
end;
$$;

create or replace function "buildImportPayloadFingerprintFromJson"(payload jsonb)
returns text
language plpgsql
immutable
strict
as $$
declare
  payload_version text := payload->>'payloadVersion';
  parts text[];
begin
  if payload_version is null or payload_version not in ('1', '2')
    or not (payload ?& array[
      'sourceRowNumber', 'sourceHash', 'occurredOn', 'kind',
      'amountMinor', 'currency', 'description'
    ])
  then
    return null;
  end if;

  parts := array[
    payload_version,
    coalesce(payload->>'sourceRowNumber', ''),
    coalesce(payload->>'sourceHash', ''),
    coalesce(payload->>'occurredOn', ''),
    coalesce(payload->>'kind', '')
  ];

  if payload_version = '2' then
    if coalesce(payload->>'direction', '') not in ('inflow', 'outflow') then
      return null;
    end if;
    parts := array_append(parts, payload->>'direction');
  end if;

  parts := parts || array[
    coalesce(payload->>'amountMinor', ''),
    coalesce(payload->>'currency', ''),
    coalesce(payload->>'description', ''),
    coalesce(payload->>'accountId', '')
  ];

  if payload_version = '2' then
    parts := array_append(parts, coalesce(payload->>'otherAccountId', ''));
  end if;

  parts := parts || array[
    coalesce(payload->>'categoryId', ''),
    coalesce(payload->>'externalId', '')
  ];

  return "fnv1a32Utf16"(array_to_string(parts, ':'));
end;
$$;

create or replace function "synchronizeAiSuggestionPayloadFingerprint"()
returns trigger
language plpgsql
as $$
declare
  next_fingerprint text;
  origin_kind text;
begin
  if lower(new."kind"::text) <> 'transaction_extraction'
    or new."payload" is null
    or jsonb_typeof(new."payload") <> 'object'
  then
    return new;
  end if;

  origin_kind := new."payload"->'origin'->>'kind';
  if origin_kind = 'import' or coalesce(new."provider", '') like 'solverfin-import%' then
    next_fingerprint := "buildImportPayloadFingerprintFromJson"(new."payload");
  else
    next_fingerprint := nullif(new."payload"->>'fingerprint', '');
  end if;

  if next_fingerprint is not null then
    new."payloadFingerprint" := next_fingerprint;
  end if;

  return new;
end;
$$;

-- Alphabetical trigger ordering is intentional: the payload contract trigger
-- normalizes/validates first (AiSuggestionPayloadContract*), this synchronization
-- runs next, and dependency freshness runs afterwards (Zk*).
create trigger "ZjAiSuggestionPayloadFingerprintSync"
before insert or update of "payload", "provider", "kind" on "AiSuggestion"
for each row
execute function "synchronizeAiSuggestionPayloadFingerprint"();

-- Repair pending rows produced before this invariant existed without touching
-- resolved history. Updating only payloadFingerprint does not invoke payload
-- immutability triggers. The function remains available for diagnostics and
-- migration regression tests.
create or replace function "repairPendingAiSuggestionPayloadFingerprints"()
returns integer
language plpgsql
as $$
declare
  repaired_count integer;
begin
  with candidate as (
    select
      "id",
      case
        when coalesce("payload"->'origin'->>'kind', '') = 'import'
          or coalesce("provider", '') like 'solverfin-import%'
          then "buildImportPayloadFingerprintFromJson"("payload")
        else nullif("payload"->>'fingerprint', '')
      end as "nextFingerprint"
    from "AiSuggestion"
    where "kind" = 'TRANSACTION_EXTRACTION'
      and "status" = 'PENDING_REVIEW'
      and "payload" is not null
      and jsonb_typeof("payload") = 'object'
  )
  update "AiSuggestion" as suggestion
  set "payloadFingerprint" = candidate."nextFingerprint"
  from candidate
  where suggestion."id" = candidate."id"
    and candidate."nextFingerprint" is not null
    and suggestion."payloadFingerprint" is distinct from candidate."nextFingerprint";

  get diagnostics repaired_count = row_count;
  return repaired_count;
end;
$$;

select "repairPendingAiSuggestionPayloadFingerprints"();
