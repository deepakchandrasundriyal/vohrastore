-- 005: alt text for the product image (Google Images ranking + accessibility).
ALTER TABLE products ADD COLUMN image_alt VARCHAR(160) NULL AFTER og_image;
UPDATE products SET image_alt = CONCAT('Vohra''s ', name, ' roasted makhana, ', weight, ' tin') WHERE image_alt IS NULL;
