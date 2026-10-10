-- Vohra's Store — database schema (MySQL 5.7+ / MariaDB 10.3+)
-- Run through `php database/install.php`, which also seeds products, coupons, settings and the first admin.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS shipment_events, shipments, decor_props, campaign_clicks, campaign_links, page_seo, schema_migrations,
  order_status_history, order_items, orders, coupons, customers, products, enquiries, settings, login_attempts, admins;
-- Later changes live in database/migrations/*.sql; install.php applies them right after this file.

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE admins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(190)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  last_login_at DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scope        VARCHAR(20)  NOT NULL,          -- 'admin' | 'customer'
  ip           VARCHAR(45)  NOT NULL,
  email        VARCHAR(190) NOT NULL,
  attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attempts_lookup (scope, ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug         VARCHAR(80)   NOT NULL,
  name         VARCHAR(120)  NOT NULL,
  tagline      VARCHAR(190)  NOT NULL DEFAULT '',
  description  TEXT          NOT NULL,
  profile      ENUM('classic','spicy','creamy','herby') NOT NULL DEFAULT 'classic',
  price        DECIMAL(10,2) NOT NULL,
  mrp          DECIMAL(10,2) NOT NULL,
  weight       VARCHAR(30)   NOT NULL DEFAULT '100 g',
  stock        INT           NOT NULL DEFAULT 0,
  low_stock_at INT           NOT NULL DEFAULT 10,
  color        CHAR(7)       NOT NULL DEFAULT '#C98A1B',
  tint         CHAR(7)       NOT NULL DEFAULT '#F2E2B8',
  image        VARCHAR(255)  NOT NULL,         -- tin shot, relative to the site root
  image_bowl   VARCHAR(255)  NULL,
  image_label  VARCHAR(255)  NULL,
  props        JSON          NOT NULL,         -- two decorative prop names, e.g. ["onion","cream"]
  ingredients  TEXT          NOT NULL,
  allergens    JSON          NOT NULL,         -- ["Peanut","Milk"]
  nutrition    JSON          NOT NULL,         -- {"energy":[per100g, perServe, "%RDA"], ...}
  is_active    TINYINT(1)    NOT NULL DEFAULT 1,
  sort_order   INT           NOT NULL DEFAULT 0,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  phone         VARCHAR(20)  NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NULL,             -- NULL = guest-checkout customer without an account
  address       JSON         NULL,             -- last saved shipping address
  notes         TEXT         NULL,
  last_login_at DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customers_email (email),
  KEY idx_customers_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupons (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40)   NOT NULL,
  type        ENUM('percent','flat') NOT NULL DEFAULT 'percent',
  value       DECIMAL(10,2) NOT NULL,
  label       VARCHAR(120)  NOT NULL,
  min_order   DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_uses    INT UNSIGNED  NULL,              -- NULL = unlimited
  used_count  INT UNSIGNED  NOT NULL DEFAULT 0,
  starts_at   DATETIME      NULL,
  expires_at  DATETIME      NULL,
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no       VARCHAR(20)   NOT NULL,
  customer_id    INT UNSIGNED  NULL,
  customer_name  VARCHAR(120)  NOT NULL,
  customer_email VARCHAR(190)  NOT NULL,
  customer_phone VARCHAR(20)   NOT NULL,
  address_line1  VARCHAR(190)  NOT NULL,
  address_line2  VARCHAR(190)  NOT NULL DEFAULT '',
  city           VARCHAR(80)   NOT NULL,
  state          VARCHAR(80)   NOT NULL,
  pin            CHAR(6)       NOT NULL,
  subtotal       DECIMAL(10,2) NOT NULL,
  discount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping       DECIMAL(10,2) NOT NULL DEFAULT 0,
  total          DECIMAL(10,2) NOT NULL,
  coupon_code    VARCHAR(40)   NULL,
  payment_method ENUM('razorpay','cod') NOT NULL,
  payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  status         ENUM('placed','packed','shipped','out_for_delivery','delivered','cancelled') NOT NULL DEFAULT 'placed',
  source         ENUM('web','admin') NOT NULL DEFAULT 'web',
  admin_notes    TEXT          NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_no (order_no),
  KEY idx_orders_created (created_at),
  KEY idx_orders_status (status),
  KEY idx_orders_customer (customer_id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED  NOT NULL,
  product_id   INT UNSIGNED  NULL,             -- NULL once the product is deleted; name/price stay as a snapshot
  product_slug VARCHAR(80)   NOT NULL,
  product_name VARCHAR(120)  NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  qty          INT UNSIGNED  NOT NULL,
  line_total   DECIMAL(10,2) NOT NULL,
  KEY idx_items_order (order_id),
  KEY idx_items_product (product_id),
  CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders (id)   ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_status_history (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id   INT UNSIGNED NOT NULL,
  status     VARCHAR(30)  NOT NULL,
  note       VARCHAR(255) NOT NULL DEFAULT '',
  admin_id   INT UNSIGNED NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_history_order (order_id),
  CONSTRAINT fk_history_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_history_admin FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE enquiries (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source     ENUM('contact','services') NOT NULL,
  topic      VARCHAR(80)  NOT NULL DEFAULT '',
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(190) NOT NULL DEFAULT '',
  phone      VARCHAR(20)  NOT NULL DEFAULT '',
  company    VARCHAR(120) NOT NULL DEFAULT '',
  city       VARCHAR(80)  NOT NULL DEFAULT '',
  quantity   VARCHAR(120) NOT NULL DEFAULT '',
  order_ref  VARCHAR(20)  NOT NULL DEFAULT '',
  message    TEXT         NOT NULL,
  status     ENUM('new','in_progress','closed') NOT NULL DEFAULT 'new',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_enquiries_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  `key`      VARCHAR(60) PRIMARY KEY,
  `value`    TEXT        NOT NULL,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
