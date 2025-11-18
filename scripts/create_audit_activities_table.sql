-- Create audit_activities table if it doesn't exist
-- Run this script in your MySQL database

CREATE TABLE IF NOT EXISTS `audit_activities` (
  `ID` BIGINT NOT NULL AUTO_INCREMENT,
  `action` VARCHAR(100) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `user_name` VARCHAR(255) NOT NULL,
  `document_id` BIGINT NULL,
  `document_name` VARCHAR(255) NULL,
  `details` TEXT NULL,
  `metadata` TEXT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` TEXT NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`),
  INDEX `idx_document_timestamp` (`document_id`, `timestamp`),
  INDEX `idx_user_timestamp` (`user_id`, `timestamp`),
  INDEX `idx_action_timestamp` (`action`, `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

