-- Adds the operator-selectable AI model preference to Workspace.
-- Nullable so existing rows keep working; app falls back to the locked
-- claude-sonnet-4-20250514 model when this is null.

ALTER TABLE "Workspace" ADD COLUMN "aiModel" TEXT;
