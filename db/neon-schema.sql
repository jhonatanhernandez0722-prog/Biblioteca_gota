-- Biblioteca Gota Gota · esquema para PostgreSQL (Neon)
-- Equivale a las migraciones 001_initial y 002_legal_consents de src/server/db/migrations.ts.
-- Ejecutar una vez en el SQL Editor de Neon (o con psql) sobre una base de datos vacía.

BEGIN;

CREATE TABLE schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────── Cuentas y sesiones ─────────────

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('reader','librarian','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  card_number TEXT NOT NULL UNIQUE,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, -- sha256 del token, nunca el token
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────── Catálogo ─────────────

CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE books (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  publisher TEXT,
  published_year INTEGER,
  isbn13 TEXT UNIQUE,
  isbn10 TEXT UNIQUE,
  language TEXT,
  page_count INTEGER,
  call_number TEXT,
  keywords TEXT,
  cover_key TEXT,
  cover_color TEXT,
  source_provider TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  source_url TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  editorial_pick BOOLEAN NOT NULL DEFAULT false,
  editorial_note TEXT,
  editorial_quote TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_demo BOOLEAN NOT NULL DEFAULT false,
  search_text TEXT NOT NULL DEFAULT '',
  sort_title TEXT NOT NULL DEFAULT '',
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX books_status_created ON books(status, created_at DESC);
CREATE INDEX books_sort_title ON books(sort_title);
-- Búsqueda con LIKE '%texto%' eficiente:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX books_search_trgm ON books USING gin (search_text gin_trgm_ops);

CREATE TABLE book_authors (
  book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (book_id, position)
);
CREATE INDEX book_authors_name ON book_authors(name);

CREATE TABLE book_categories (
  book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, category_id)
);
CREATE INDEX book_categories_category ON book_categories(category_id);

CREATE TABLE copies (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  location TEXT,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('new','good','worn','damaged')),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','on_loan','maintenance','lost','withdrawn')),
  notes TEXT,
  acquired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX copies_book_status ON copies(book_id, status);

-- ───────────── Circulación ─────────────

CREATE TABLE loans (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  copy_id BIGINT REFERENCES copies(id) ON DELETE SET NULL,
  status TEXT NOT NULL
    CHECK (status IN ('pending','approved','checked_out','returned','rejected','cancelled','expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  pickup_deadline TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  checked_out_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  returned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  renewals INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX loans_user_status ON loans(user_id, status);
CREATE INDEX loans_book_status ON loans(book_id, status);
CREATE INDEX loans_status_due ON loans(status, due_at);
-- Un lector no puede tener dos préstamos vivos del mismo libro.
CREATE UNIQUE INDEX loans_one_active_per_user_book ON loans(user_id, book_id)
  WHERE status IN ('pending','approved','checked_out');
-- Un ejemplar no puede estar en dos préstamos vivos a la vez.
CREATE UNIQUE INDEX loans_one_active_per_copy ON loans(copy_id)
  WHERE status IN ('approved','checked_out');

CREATE TABLE reservations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','fulfilled','cancelled')),
  loan_id BIGINT REFERENCES loans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reservations_book_status ON reservations(book_id, status, created_at);
CREATE UNIQUE INDEX reservations_one_waiting ON reservations(user_id, book_id) WHERE status = 'waiting';

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  summary TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_created ON audit_log(created_at DESC);
CREATE INDEX audit_entity ON audit_log(entity_type, entity_id);

-- ───────────── Legal y consentimientos ─────────────

CREATE TABLE legal_document_versions (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  effective_at DATE NOT NULL,
  content_hash TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

-- Evidencias: solo inserción, encadenadas por hash.
CREATE TABLE consent_records (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  request_id TEXT,
  user_id BIGINT REFERENCES users(id),
  subject_ref TEXT NOT NULL,
  document_slug TEXT NOT NULL,
  document_version TEXT NOT NULL,
  document_effective_at DATE NOT NULL,
  document_hash TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('accepted','rejected','revoked')),
  source TEXT NOT NULL,
  supersedes_id BIGINT REFERENCES consent_records(id),
  recorded_at TIMESTAMPTZ NOT NULL,
  prev_hash TEXT NOT NULL,
  row_hash TEXT NOT NULL
);
CREATE INDEX consent_user ON consent_records(user_id, document_slug, recorded_at DESC);

CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%', TG_ARGV[0];
END $$;

CREATE TRIGGER consent_records_no_update BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION forbid_change('Los registros de consentimiento no se pueden modificar');
CREATE TRIGGER consent_records_no_delete BEFORE DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION forbid_change('Los registros de consentimiento no se pueden borrar');
CREATE TRIGGER consent_records_no_truncate BEFORE TRUNCATE ON consent_records
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change('Los registros de consentimiento no se pueden vaciar');
CREATE TRIGGER legal_versions_no_update BEFORE UPDATE ON legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_change('Una versión publicada no se modifica: publica una nueva');

INSERT INTO schema_migrations (id) VALUES ('001_initial'), ('002_legal_consents');

COMMIT;

-- Recomendado: un rol de aplicación sin permisos de borrado sobre las evidencias.
-- CREATE ROLE gotagota_app LOGIN PASSWORD '...';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gotagota_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO gotagota_app;
-- REVOKE UPDATE, DELETE, TRUNCATE ON consent_records FROM gotagota_app;
