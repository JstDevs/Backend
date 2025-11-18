-- Option 1: Remove foreign key constraint (if you don't need strict referential integrity)
-- This allows inserting audit activities even if user doesn't exist

ALTER TABLE `audit_activities` 
DROP FOREIGN KEY `audit_activities_ibfk_1`;

-- Option 2: If you want to keep the constraint but make it less strict,
-- you can modify it to allow NULL or use ON DELETE SET NULL
-- (But first you need to make user_id nullable if you choose this)

-- ALTER TABLE `audit_activities` 
-- MODIFY COLUMN `user_id` BIGINT NULL;

-- Then recreate the foreign key with ON DELETE SET NULL:
-- ALTER TABLE `audit_activities`
-- ADD CONSTRAINT `audit_activities_ibfk_1` 
-- FOREIGN KEY (`user_id`) REFERENCES `Users` (`ID`) 
-- ON DELETE SET NULL ON UPDATE CASCADE;

