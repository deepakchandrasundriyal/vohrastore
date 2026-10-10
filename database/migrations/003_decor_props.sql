-- 003: decorative props become a managed library (bundled images + uploads) instead of a fixed folder listing.
CREATE TABLE decor_props (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug       VARCHAR(60)  NOT NULL,           -- stored in products.props
  label      VARCHAR(80)  NOT NULL,
  image      VARCHAR(255) NOT NULL,           -- site-relative path
  sort_order INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_decor_props_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
