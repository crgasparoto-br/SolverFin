// SQL builders compartilhados para a tabela "AiSuggestion".
// Extraidos de imports.ts e review-suggestions.ts, que mantinham copias
// identicas destas duas funcoes (higienizacao de codigo).

export function buildInsertAiSuggestionSql(): string {
  return `insert into "AiSuggestion"
    ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
     "confidence", "explanation", "payload", "sourceSuggestionId", "payloadFingerprint", "provider", "model",
     "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18)`;
}

export function buildUpdateAiSuggestionSql(): string {
  return `update "AiSuggestion" set
    "kind" = $4, "status" = $5, "sourceEntityId" = $6, "targetEntityId" = $7, "confidence" = $8,
    "explanation" = $9, "payload" = $10::jsonb, "sourceSuggestionId" = $11, "payloadFingerprint" = $12,
    "provider" = $13, "model" = $14, "reviewedByUserId" = $15, "reviewedAt" = $16,
    "createdAt" = $17, "updatedAt" = $18
   where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`;
}
