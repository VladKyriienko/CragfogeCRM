-- Local development roles. Applied once, when the Postgres data volume is created.
-- The API connects as crm_app. crm_migrator owns tables and runs migrations.
-- These passwords are for local Docker only.

CREATE ROLE crm_migrator LOGIN PASSWORD 'crm_migrator'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

CREATE ROLE crm_app LOGIN PASSWORD 'crm_app'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

GRANT CONNECT, CREATE ON DATABASE crm TO crm_migrator;
GRANT CONNECT ON DATABASE crm TO crm_app;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO crm_migrator;
GRANT USAGE ON SCHEMA public TO crm_app;
