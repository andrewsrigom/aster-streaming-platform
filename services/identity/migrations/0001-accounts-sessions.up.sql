BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE ROLE aster_identity_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA identity;
REVOKE ALL ON SCHEMA identity FROM PUBLIC;

CREATE TABLE identity.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE identity.accounts (
  id uuid PRIMARY KEY,
  issuer varchar(256) NOT NULL CHECK (length(issuer) > 0),
  subject varchar(256) NOT NULL CHECK (length(subject) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (issuer, subject)
);
CREATE TABLE identity.sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  signer_id uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 8),
  credential_digest varchar(64) NOT NULL CHECK (credential_digest ~ '^[a-f0-9]{64}$'),
  issued_at bigint NOT NULL CHECK (issued_at >= 0),
  expires_at bigint NOT NULL CHECK (expires_at > issued_at AND expires_at <= issued_at + 1800 AND expires_at <= 8640000000000),
  UNIQUE (account_id, slot)
);

GRANT USAGE ON SCHEMA identity TO aster_identity_runtime;
GRANT SELECT, INSERT ON identity.accounts TO aster_identity_runtime;
-- PostgreSQL row locking requires UPDATE on at least one column; identity keys stay immutable.
GRANT UPDATE (created_at) ON identity.accounts TO aster_identity_runtime;
GRANT SELECT, INSERT, DELETE ON identity.sessions TO aster_identity_runtime;
INSERT INTO identity.schema_migrations(version) VALUES (1);
COMMIT;
