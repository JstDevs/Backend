
CREATE TABLE IF NOT EXISTS `RoleDocumentAccess` (
  `LinkID` VARCHAR(255) NOT NULL,
  `UserAccessID` BIGINT NOT NULL,
  `View` TINYINT(1) NOT NULL DEFAULT 0,
  `Add` TINYINT(1) NOT NULL DEFAULT 0,
  `Edit` TINYINT(1) NOT NULL DEFAULT 0,
  `Delete` TINYINT(1) NOT NULL DEFAULT 0,
  `Print` TINYINT(1) NOT NULL DEFAULT 0,
  `Confidential` TINYINT(1) NOT NULL DEFAULT 0,
  `Comment` TINYINT(1) NOT NULL DEFAULT 0,
  `Collaborate` TINYINT(1) NOT NULL DEFAULT 0,
  `Finalize` TINYINT(1) NOT NULL DEFAULT 0,
  `Masking` TINYINT(1) NOT NULL DEFAULT 0,
  `Active` TINYINT(1) NOT NULL DEFAULT 1,
  `CreatedBy` VARCHAR(255) NULL,
  `CreatedDate` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `fields` TEXT NULL,
  PRIMARY KEY (`LinkID`, `UserAccessID`),
  INDEX `idx_UserAccessID` (`UserAccessID`),
  INDEX `idx_LinkID` (`LinkID`),
  INDEX `idx_Active` (`Active`),
  CONSTRAINT `fk_RoleDocumentAccess_UserAccess` 
    FOREIGN KEY (`UserAccessID`) 
    REFERENCES `UserAccess` (`ID`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



