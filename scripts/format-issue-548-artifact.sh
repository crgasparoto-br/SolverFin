#!/usr/bin/env bash
set -euo pipefail

files=(
  apps/api/src/import-batches-router.ts
  apps/api/src/ofx-import-review.integration.test.ts
  apps/api/src/ofx-imports.test.ts
  apps/api/src/repositories/ofx-import-parser.ts
  apps/api/src/repositories/ofx-import-store.ts
  apps/web/src/dev-server/inbox-ofx-import-enhancement.test.ts
  apps/web/src/dev-server/inbox-ofx-import-enhancement.ts
  docs/STATUS_MATRIX.md
)

npx prettier --write "${files[@]}"

for file in "${files[@]}"; do
  printf 'FORMAT_548_BEGIN %s\n' "$file"
  base64 -w0 "$file"
  printf '\nFORMAT_548_END %s\n' "$file"
done
