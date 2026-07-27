-- A single order can contain products from more than one spending category.
-- Keep category as the primary category for backwards-compatible grouping and
-- store the complete, de-duplicated category list as JSON for badges/detail.
ALTER TABLE purchases ADD COLUMN category_tags TEXT;
ALTER TABLE pending_purchases ADD COLUMN category_tags TEXT;
