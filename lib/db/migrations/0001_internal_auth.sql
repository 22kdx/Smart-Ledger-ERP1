-- Internal ERP authentication. Apply only to the user's own PostgreSQL database.
-- The migration is additive; it does not alter existing ERP records.

DO $$
BEGIN
  CREATE TYPE membership_role AS ENUM (
    'owner',
    'admin',
    'accountant',
    'sales',
    'purchasing',
    'inventory',
    'hr',
    'viewer'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY,
  email varchar(254) NOT NULL,
  display_name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_unique ON auth_users (email);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_idx ON auth_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS auth_refresh_tokens_family_idx ON auth_refresh_tokens (family_id);

CREATE TABLE IF NOT EXISTS auth_login_throttles (
  email_key char(64) NOT NULL,
  ip_hash char(64) NOT NULL,
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  window_started_at timestamptz NOT NULL,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_key, ip_hash)
);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  event_type varchar(40) NOT NULL CHECK (
    event_type IN (
      'register_success',
      'login_success',
      'login_failed',
      'login_locked',
      'refresh_success',
      'refresh_reuse',
      'logout'
    )
  ),
  email_key char(64) NOT NULL,
  ip_hash char(64) NOT NULL,
  user_agent varchar(256),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_audit_events_user_date_idx ON auth_audit_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS auth_audit_events_date_idx ON auth_audit_events (created_at);

CREATE TABLE IF NOT EXISTS auth_role_permissions (
  role membership_role NOT NULL,
  permission varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

INSERT INTO auth_role_permissions (role, permission) VALUES
  ('owner', 'companies:read'),
  ('owner', 'companies:manage'),
  ('owner', 'members:manage'),
  ('owner', 'settings:manage'),
  ('owner', 'accounts:read'),
  ('owner', 'accounts:write'),
  ('owner', 'journals:read'),
  ('owner', 'journals:write'),
  ('owner', 'sales:read'),
  ('owner', 'sales:write'),
  ('owner', 'purchasing:read'),
  ('owner', 'purchasing:write'),
  ('owner', 'inventory:read'),
  ('owner', 'inventory:write'),
  ('owner', 'hr:read'),
  ('owner', 'hr:write'),
  ('admin', 'companies:read'),
  ('admin', 'companies:manage'),
  ('admin', 'members:manage'),
  ('admin', 'settings:manage'),
  ('admin', 'accounts:read'),
  ('admin', 'accounts:write'),
  ('admin', 'journals:read'),
  ('admin', 'journals:write'),
  ('admin', 'sales:read'),
  ('admin', 'sales:write'),
  ('admin', 'purchasing:read'),
  ('admin', 'purchasing:write'),
  ('admin', 'inventory:read'),
  ('admin', 'inventory:write'),
  ('admin', 'hr:read'),
  ('admin', 'hr:write'),
  ('accountant', 'companies:read'),
  ('accountant', 'accounts:read'),
  ('accountant', 'accounts:write'),
  ('accountant', 'journals:read'),
  ('accountant', 'journals:write'),
  ('accountant', 'sales:read'),
  ('accountant', 'inventory:read'),
  ('sales', 'companies:read'),
  ('sales', 'sales:read'),
  ('sales', 'sales:write'),
  ('purchasing', 'companies:read'),
  ('purchasing', 'purchasing:read'),
  ('purchasing', 'purchasing:write'),
  ('inventory', 'companies:read'),
  ('inventory', 'inventory:read'),
  ('inventory', 'inventory:write'),
  ('hr', 'companies:read'),
  ('hr', 'hr:read'),
  ('hr', 'hr:write'),
  ('viewer', 'companies:read'),
  ('viewer', 'accounts:read'),
  ('viewer', 'journals:read'),
  ('viewer', 'sales:read'),
  ('viewer', 'purchasing:read'),
  ('viewer', 'inventory:read'),
  ('viewer', 'hr:read')
ON CONFLICT (role, permission) DO NOTHING;
