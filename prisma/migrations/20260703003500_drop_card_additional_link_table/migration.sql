-- Removes the legacy manual additional-card link table after the
-- card-instrument model became the active card relationship.
-- The table is no longer represented in Prisma schema or served by API routes.

drop table if exists "CardAdditionalLink";
