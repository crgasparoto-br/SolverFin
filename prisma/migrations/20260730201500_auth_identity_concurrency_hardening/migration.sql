CREATE OR REPLACE FUNCTION "protectUserExternalIdentity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    OLD."externalAuthProvider" IS NOT NULL OR
    OLD."externalAuthSubject" IS NOT NULL
  ) AND (
    NEW."externalAuthProvider" IS DISTINCT FROM OLD."externalAuthProvider" OR
    NEW."externalAuthSubject" IS DISTINCT FROM OLD."externalAuthSubject"
  ) THEN
    RAISE EXCEPTION 'External authentication identity is immutable once linked.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "User_external_identity_immutable" ON "User";
CREATE TRIGGER "User_external_identity_immutable"
BEFORE UPDATE OF "externalAuthProvider", "externalAuthSubject" ON "User"
FOR EACH ROW
EXECUTE FUNCTION "protectUserExternalIdentity"();

CREATE OR REPLACE FUNCTION "revokeSessionsWhenUserDisabled"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "ApplicationSession"
  SET "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
      "revocationReason" = COALESCE("revocationReason", 'user_disabled')
  WHERE "userId" = NEW."id"
    AND "revokedAt" IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "User_revoke_sessions_when_disabled" ON "User";
CREATE TRIGGER "User_revoke_sessions_when_disabled"
AFTER UPDATE OF "status" ON "User"
FOR EACH ROW
WHEN (
  NEW."status" = 'DISABLED'::"UserStatus" AND
  OLD."status" IS DISTINCT FROM NEW."status"
)
EXECUTE FUNCTION "revokeSessionsWhenUserDisabled"();

UPDATE "ApplicationSession" AS session
SET "revokedAt" = COALESCE(session."revokedAt", CURRENT_TIMESTAMP),
    "revocationReason" = COALESCE(session."revocationReason", 'user_disabled')
FROM "User" AS app_user
WHERE session."userId" = app_user."id"
  AND app_user."status" = 'DISABLED'::"UserStatus"
  AND session."revokedAt" IS NULL;
