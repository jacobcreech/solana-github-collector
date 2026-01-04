-- Initialization SQL for PostgreSQL Database
-- This script sets up the database for local development

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Note: Tables will be automatically created by Sequelize
-- This file is here for any additional setup you might need

-- Create a health check function
CREATE OR REPLACE FUNCTION database_health_check()
RETURNS TEXT AS $$
BEGIN
    RETURN 'Database is healthy';
END;
$$ LANGUAGE plpgsql;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'Database initialized successfully for Solana GitHub Collector';
END $$;
