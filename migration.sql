-- Run in phpMyAdmin (SQL tab) on im1_banking_db
-- (approval_status / requested_account_type were added earlier - skip if already done)

CREATE TABLE IF NOT EXISTS bill_payments (
  payment_id     INT AUTO_INCREMENT PRIMARY KEY,
  account_number VARCHAR(30) NOT NULL,
  biller         VARCHAR(60) NOT NULL,
  category       VARCHAR(40) NOT NULL,
  reference_no   VARCHAR(40) NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  paid_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (account_number)
);
