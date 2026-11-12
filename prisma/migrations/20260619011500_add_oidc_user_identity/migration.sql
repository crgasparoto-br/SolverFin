ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User"
  ADD COLUMN "externalAuthProvider" VARCHAR(200),
  ADD COLUMN "externalAuthSubject" VARCHAR(240);

CREATE UNIQUE INDEX "User_externalAuthProvider_externalAuthSubject_key"
  ON "User" ("externalAuthProvider", "externalAuthSubject");
