CREATE OR REPLACE FUNCTION "setCategoryNormalizedName"()
RETURNS trigger AS $$
BEGIN
  NEW."normalizedName" = lower(
    translate(
      regexp_replace(trim(NEW."name"), '\s+', ' ', 'g'),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Category_set_normalized_name" ON "Category";

CREATE TRIGGER "Category_set_normalized_name"
BEFORE INSERT OR UPDATE OF "name" ON "Category"
FOR EACH ROW
EXECUTE FUNCTION "setCategoryNormalizedName"();
