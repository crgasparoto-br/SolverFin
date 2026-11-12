ALTER TABLE "Category"
ADD COLUMN "normalizedName" VARCHAR(160);

UPDATE "Category"
SET "normalizedName" = lower(
  translate(
    regexp_replace(trim("name"), '\s+', ' ', 'g'),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
  )
);

ALTER TABLE "Category"
ALTER COLUMN "normalizedName" SET NOT NULL;

CREATE UNIQUE INDEX "Category_unique_logical_name"
ON "Category" (
  "organizationId",
  "financialProfileId",
  "kind",
  COALESCE("parentCategoryId", '00000000-0000-0000-0000-000000000000'::uuid),
  "normalizedName"
);
