-- 004: shipping (Shiprocket or manual courier) and tracking history. One shipment per order.
CREATE TABLE shipments (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id            INT UNSIGNED  NOT NULL,
  provider            ENUM('shiprocket','manual') NOT NULL,
  sr_order_id         BIGINT UNSIGNED NULL,          -- Shiprocket order id
  sr_shipment_id      BIGINT UNSIGNED NULL,          -- Shiprocket shipment id
  awb                 VARCHAR(40)   NULL,
  courier_id          INT UNSIGNED  NULL,
  courier_name        VARCHAR(120)  NULL,
  tracking_url        VARCHAR(255)  NULL,
  -- normalised: created | awb_assigned | pickup_scheduled | in_transit | out_for_delivery | delivered | cancelled | rto | exception
  status              VARCHAR(30)   NOT NULL DEFAULT 'created',
  courier_status      VARCHAR(80)   NULL,            -- raw status text from the courier
  shipping_cost       DECIMAL(10,2) NULL,
  weight_kg           DECIMAL(7,3)  NOT NULL,
  length_cm           DECIMAL(6,1)  NOT NULL,
  breadth_cm          DECIMAL(6,1)  NOT NULL,
  height_cm           DECIMAL(6,1)  NOT NULL,
  label_url           VARCHAR(500)  NULL,
  manifest_url        VARCHAR(500)  NULL,
  invoice_url         VARCHAR(500)  NULL,
  pickup_scheduled_at DATETIME      NULL,
  pickup_token        VARCHAR(60)   NULL,
  etd                 DATETIME      NULL,            -- courier's expected delivery date
  delivered_at        DATETIME      NULL,
  last_synced_at      DATETIME      NULL,
  last_error          VARCHAR(500)  NULL,
  created_by          INT UNSIGNED  NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shipments_order (order_id),
  KEY idx_shipments_awb (awb),
  KEY idx_shipments_status (status),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_shipments_admin FOREIGN KEY (created_by) REFERENCES admins (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shipment_events (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT UNSIGNED NOT NULL,
  status      VARCHAR(80)  NOT NULL,
  activity    VARCHAR(255) NOT NULL DEFAULT '',
  location    VARCHAR(120) NOT NULL DEFAULT '',
  event_at    DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event (shipment_id, event_at, status),
  CONSTRAINT fk_events_shipment FOREIGN KEY (shipment_id) REFERENCES shipments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
