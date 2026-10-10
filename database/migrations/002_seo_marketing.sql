-- 002: SEO fields, page-level SEO, marketing attribution and campaign links.

ALTER TABLE products
  ADD COLUMN seo_title       VARCHAR(70)  NULL AFTER nutrition,
  ADD COLUMN seo_description VARCHAR(170) NULL AFTER seo_title,
  ADD COLUMN seo_keywords    VARCHAR(255) NULL AFTER seo_description,
  ADD COLUMN og_image        VARCHAR(255) NULL AFTER seo_keywords;

CREATE TABLE page_seo (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  path            VARCHAR(190) NOT NULL,          -- storefront file, e.g. 'index.html'
  label           VARCHAR(120) NOT NULL,
  seo_title       VARCHAR(70)  NOT NULL,
  seo_description VARCHAR(170) NOT NULL DEFAULT '',
  seo_keywords    VARCHAR(255) NOT NULL DEFAULT '',
  og_image        VARCHAR(255) NULL,
  canonical_url   VARCHAR(255) NULL,
  noindex         TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_page_seo_path (path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE campaign_links (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(12)  NOT NULL,          -- short-link code, also sent as utm_id
  name            VARCHAR(120) NOT NULL,
  destination     VARCHAR(190) NOT NULL,          -- storefront path, e.g. 'product-peri-peri.html'
  utm_source      VARCHAR(100) NOT NULL,
  utm_medium      VARCHAR(100) NOT NULL,
  utm_campaign    VARCHAR(100) NOT NULL,
  utm_term        VARCHAR(100) NOT NULL DEFAULT '',
  utm_content     VARCHAR(100) NOT NULL DEFAULT '',
  notes           VARCHAR(255) NOT NULL DEFAULT '',
  clicks          INT UNSIGNED NOT NULL DEFAULT 0,
  last_clicked_at DATETIME     NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_code (code),
  KEY idx_campaign_utm (utm_source, utm_campaign),
  CONSTRAINT fk_campaign_admin FOREIGN KEY (created_by) REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE campaign_clicks (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  link_id    INT UNSIGNED NOT NULL,
  referrer   VARCHAR(255) NOT NULL DEFAULT '',
  clicked_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_clicks_link (link_id, clicked_at),
  CONSTRAINT fk_clicks_link FOREIGN KEY (link_id) REFERENCES campaign_links (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Attribution captured when the order is placed (last click). NULL source = direct / unknown.
ALTER TABLE orders
  ADD COLUMN utm_source   VARCHAR(100) NULL AFTER source,
  ADD COLUMN utm_medium   VARCHAR(100) NULL AFTER utm_source,
  ADD COLUMN utm_campaign VARCHAR(100) NULL AFTER utm_medium,
  ADD COLUMN utm_term     VARCHAR(100) NULL AFTER utm_campaign,
  ADD COLUMN utm_content  VARCHAR(100) NULL AFTER utm_term,
  ADD COLUMN utm_id       VARCHAR(12)  NULL AFTER utm_content,
  ADD COLUMN landing_page VARCHAR(255) NULL AFTER utm_id,
  ADD COLUMN referrer     VARCHAR(255) NULL AFTER landing_page,
  ADD KEY idx_orders_utm_source (utm_source),
  ADD KEY idx_orders_utm_campaign (utm_campaign),
  ADD KEY idx_orders_utm_id (utm_id);
