-- Issue #690 remediation: keep the database-side import fingerprint aligned
-- with @solverfin/domain after XLSX/PDF and card-invoice metadata were added.
-- The dependency freshness trigger relies on this value when deterministic
-- review candidates are approved.

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
    parts := parts || array[
      coalesce(payload->>'otherAccountId', ''),
      coalesce(payload->>'targetKind', 'account'),
      coalesce(payload->>'cardId', ''),
      coalesce(payload->>'cardInstrumentId', ''),
      coalesce(payload->>'cardInstrumentHint', ''),
      coalesce(payload->>'invoicePeriod', '')
    ];
    if payload ? 'installmentAmountMinor' then
      parts := parts || array[
        'installment-amount',
        coalesce(payload->>'installmentAmountMinor', '')
      ];
    end if;
    parts := parts || array[
      coalesce(payload->>'installmentSequence', ''),
      coalesce(payload->>'installmentTotal', '')
    ];
  end if;

  parts := parts || array[
    coalesce(payload->>'categoryId', ''),
    coalesce(payload->>'externalId', '')
  ];

  return "fnv1a32Utf16"(array_to_string(parts, ':'));
end;
$$;

-- Re-align pending import sources created before this migration. Existing
-- deterministic children that reference the old fingerprint are intentionally
-- invalidated/rebuilt by the canonical scanner on the next review pass.
select "repairPendingAiSuggestionPayloadFingerprints"();
