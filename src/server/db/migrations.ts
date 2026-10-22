/**
 * Migraciones de PostgreSQL, en orden. Cada una se aplica una sola vez y queda en
 * `schema_migrations`. Nunca edites una migración aplicada: añade otra al final.
 * `npm run db:schema` regenera db/neon-schema.sql a partir de este archivo.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_initial',
    sql: `
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
`,
  },
  {
    id: '002_legal_consents',
    sql: `
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
`,
  },
  {
    id: '003_identity_cards_terms_fines',
    sql: `
-- ───────────── Identificación del lector ─────────────
-- De la tarjeta de crédito solo se guarda franquicia y últimos 4 dígitos (PCI DSS):
-- el número completo nunca llega a la base de datos.
ALTER TABLE users ADD COLUMN phone TEXT CHECK (phone ~ '^[0-9]{10}$');
ALTER TABLE users ADD COLUMN document_type TEXT CHECK (document_type IN ('CC','TI'));
ALTER TABLE users ADD COLUMN document_number TEXT CHECK (document_number ~ '^[1-9][0-9]{5,10}$');
ALTER TABLE users ADD COLUMN card_brand TEXT;
ALTER TABLE users ADD COLUMN card_last4 TEXT CHECK (card_last4 ~ '^[0-9]{4}$');
ALTER TABLE users ADD COLUMN identity_updated_at TIMESTAMPTZ;
-- Una persona, una cuenta: el documento no se repite.
CREATE UNIQUE INDEX users_document ON users(document_type, document_number) WHERE document_number IS NOT NULL;

-- ───────────── Carnés de préstamo ─────────────
CREATE TABLE loan_cards (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL UNIQUE CHECK (number ~ '^[A-Z0-9][A-Z0-9-]{4,22}[A-Z0-9]$'),
  label TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX loan_cards_user ON loan_cards(user_id);
CREATE UNIQUE INDEX loan_cards_one_primary ON loan_cards(user_id) WHERE is_primary;
INSERT INTO loan_cards (user_id, number, label, is_primary, created_at)
  SELECT id, card_number, 'Carné de lector Gota Gota', true, created_at FROM users;

-- ───────────── Plazo de lectura fijo ─────────────
ALTER TABLE loans ADD COLUMN loan_days INTEGER;
-- Los préstamos anteriores se pidieron con el plazo único de 21 días.
UPDATE loans SET loan_days = 21;
ALTER TABLE loans ALTER COLUMN loan_days SET NOT NULL;
ALTER TABLE loans ADD CONSTRAINT loans_loan_days_range CHECK (loan_days BETWEEN 1 AND 60);
ALTER TABLE loans ADD COLUMN loan_card_id BIGINT REFERENCES loan_cards(id) ON DELETE SET NULL;
ALTER TABLE loans ADD COLUMN loan_card_number TEXT;
UPDATE loans l SET loan_card_number = u.card_number FROM users u WHERE u.id = l.user_id;

ALTER TABLE reservations ADD COLUMN loan_days INTEGER NOT NULL DEFAULT 21 CHECK (loan_days BETWEEN 1 AND 60);
ALTER TABLE reservations ADD COLUMN loan_card_id BIGINT REFERENCES loan_cards(id) ON DELETE SET NULL;

-- Una vez confirmado, ni el plazo elegido ni la fecha de devolución cambian.
-- Solo una corrección explícita de datos (SET LOCAL gotagota.term_override = 'on') lo permite.
CREATE FUNCTION loans_lock_term() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('gotagota.term_override', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.loan_days IS DISTINCT FROM OLD.loan_days THEN
    RAISE EXCEPTION 'El plazo de lectura de un préstamo confirmado no se puede modificar';
  END IF;
  IF OLD.due_at IS NOT NULL AND NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    RAISE EXCEPTION 'La fecha de devolución de un préstamo entregado no se puede modificar';
  END IF;
  IF NEW.renewals <> OLD.renewals THEN
    RAISE EXCEPTION 'Los préstamos tienen un plazo fijo y no se renuevan';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loans_term_locked BEFORE UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION loans_lock_term();

-- ───────────── Multas por mora ─────────────
-- Multa = días de retraso × tarifa diaria. La base de datos garantiza la fórmula.
CREATE TABLE fines (
  id BIGSERIAL PRIMARY KEY,
  loan_id BIGINT NOT NULL UNIQUE REFERENCES loans(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  days_late INTEGER NOT NULL CHECK (days_late > 0),
  daily_rate INTEGER NOT NULL CHECK (daily_rate > 0),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  settled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  settle_note TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fines_formula CHECK (amount = days_late * daily_rate),
  CONSTRAINT fines_settled CHECK ((status = 'pending') = (settled_at IS NULL))
);
CREATE INDEX fines_user_status ON fines(user_id, status);
CREATE INDEX fines_status_created ON fines(status, created_at DESC);

-- El cálculo de una multa no se reescribe: solo cambia su estado (pagada o condonada).
CREATE FUNCTION fines_lock_amount() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.loan_id <> OLD.loan_id OR NEW.user_id <> OLD.user_id OR NEW.days_late <> OLD.days_late
     OR NEW.daily_rate <> OLD.daily_rate OR NEW.amount <> OLD.amount THEN
    RAISE EXCEPTION 'El cálculo de una multa no se puede modificar';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Una multa pagada o condonada ya no cambia';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fines_amount_locked BEFORE UPDATE ON fines
  FOR EACH ROW EXECUTE FUNCTION fines_lock_amount();
CREATE TRIGGER fines_no_delete BEFORE DELETE ON fines
  FOR EACH ROW EXECUTE FUNCTION forbid_change('Las multas no se borran: se pagan o se condonan');
`,
  },
]
