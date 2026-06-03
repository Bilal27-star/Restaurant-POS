-- Enable Kitchen Delta Printing for existing restaurants (Phase 2/2.5).
-- Only sets the flag when absent so explicit opt-out (false) is preserved.

UPDATE "system_settings"
SET "settings_json" = "settings_json" || '{"kitchenDeltaPrintingEnabled": true}'::jsonb
WHERE NOT ("settings_json" ? 'kitchenDeltaPrintingEnabled');
