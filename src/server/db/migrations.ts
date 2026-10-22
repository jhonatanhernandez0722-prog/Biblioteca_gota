/**
 * Migraciones en orden. Cada una se aplica una sola vez y queda registrada
 * en `schema_migrations`. Nunca edites una migración ya aplicada: añade otra.
 */
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_initial',
    sql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('reader','librarian','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  card_number TEXT NOT NULL UNIQUE,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
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
  featured INTEGER NOT NULL DEFAULT 0,
  editorial_pick INTEGER NOT NULL DEFAULT 0,
  editorial_note TEXT,
  editorial_quote TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL DEFAULT '',
  sort_title TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX books_status_created ON books(status, created_at DESC);
CREATE INDEX books_sort_title ON books(sort_title);

CREATE TABLE book_authors (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (book_id, position)
);
CREATE INDEX book_authors_name ON book_authors(name);

CREATE TABLE book_categories (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, category_id)
);
CREATE INDEX book_categories_category ON book_categories(category_id);

CREATE TABLE copies (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  location TEXT,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('new','good','worn','damaged')),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','on_loan','maintenance','lost','withdrawn')),
  notes TEXT,
  acquired_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX copies_book_status ON copies(book_id, status);

CREATE TABLE loans (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  copy_id INTEGER REFERENCES copies(id) ON DELETE SET NULL,
  status TEXT NOT NULL
    CHECK (status IN ('pending','approved','checked_out','returned','rejected','cancelled','expired')),
  requested_at TEXT NOT NULL DEFAULT ${NOW},
  decided_at TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  pickup_deadline TEXT,
  checked_out_at TEXT,
  checked_out_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at TEXT,
  returned_at TEXT,
  returned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  renewals INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ${NOW}
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
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','fulfilled','cancelled')),
  loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX reservations_book_status ON reservations(book_id, status, created_at);
CREATE UNIQUE INDEX reservations_one_waiting ON reservations(user_id, book_id) WHERE status = 'waiting';

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  summary TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX audit_created ON audit_log(created_at DESC);
CREATE INDEX audit_entity ON audit_log(entity_type, entity_id);
`,
  },
  {
    id: '002_legal_consents',
    sql: `
-- Versiones publicadas de los documentos legales. Una versión no se edita: se publica otra.
CREATE TABLE legal_document_versions (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  registered_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (slug, version)
);

-- Evidencia de consentimientos: solo se añaden filas (aceptación, rechazo o revocación).
-- Cada fila encadena el hash de la anterior para detectar manipulaciones.
CREATE TABLE consent_records (
  id INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  request_id TEXT,
  user_id INTEGER REFERENCES users(id),
  subject_ref TEXT NOT NULL,
  document_slug TEXT NOT NULL,
  document_version TEXT NOT NULL,
  document_effective_at TEXT NOT NULL,
  document_hash TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('accepted','rejected','revoked')),
  source TEXT NOT NULL,
  supersedes_id INTEGER REFERENCES consent_records(id),
  recorded_at TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  row_hash TEXT NOT NULL
);
CREATE INDEX consent_user ON consent_records(user_id, document_slug, recorded_at DESC);

CREATE TRIGGER consent_records_no_update BEFORE UPDATE ON consent_records
BEGIN SELECT RAISE(ABORT, 'Los registros de consentimiento no se pueden modificar'); END;
CREATE TRIGGER consent_records_no_delete BEFORE DELETE ON consent_records
BEGIN SELECT RAISE(ABORT, 'Los registros de consentimiento no se pueden borrar'); END;
CREATE TRIGGER legal_versions_no_update BEFORE UPDATE ON legal_document_versions
BEGIN SELECT RAISE(ABORT, 'Una versión publicada no se modifica: publica una nueva'); END;
`,
  },
]
