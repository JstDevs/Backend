-- Migration: Add Filepath column to DocumentVersions table
-- Purpose: Store filepath for version-specific file storage
-- Date: 2024

ALTER TABLE DocumentVersions 
ADD COLUMN Filepath VARCHAR(500) NULL 
COMMENT 'Path to version-specific file storage';

-- Add index for faster filepath lookups (optional but recommended)
CREATE INDEX idx_versions_filepath ON DocumentVersions(Filepath(255));

