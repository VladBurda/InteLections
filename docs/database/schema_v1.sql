PRAGMA foreign_keys = ON;

-- InteLections database schema v1 (SQLite)
-- Goals:
-- 1) Clear domain boundaries.
-- 2) Easy future extension (new roles, content types, payment providers, AI features).
-- 3) Migration-friendly design (no hard coupling to one auth/payment approach).

BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Core identity and access
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                        -- UUID/ULID string
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,                         -- nullable for OAuth-only accounts
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,                            -- ISO date YYYY-MM-DD
  avatar_url TEXT,
  bio TEXT,
  location TEXT,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'blocked', 'deleted')),
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE
    CHECK (code IN ('personal', 'student', 'teacher', 'admin')),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by TEXT,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Allows one account to use local auth + OAuth providers in parallel.
CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,                     -- local/google/github/etc.
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Optional "current mode" selected by user in UI.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  active_role_id INTEGER,
  ui_locale TEXT DEFAULT 'pl-PL',
  timezone TEXT DEFAULT 'Europe/Warsaw',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (active_role_id) REFERENCES roles(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Catalog: courses, lessons, media, taxonomy
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id TEXT,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,                -- main author/owner
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_image_url TEXT,
  level TEXT CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  language_code TEXT NOT NULL DEFAULT 'pl',
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted', 'private')),
  access_type TEXT NOT NULL DEFAULT 'free'
    CHECK (access_type IN ('free', 'paid')),
  price_cents INTEGER,
  currency TEXT,
  publish_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK ((access_type = 'free' AND price_cents IS NULL AND currency IS NULL)
      OR (access_type = 'paid' AND price_cents IS NOT NULL AND currency IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS course_instructors (
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  instructor_role TEXT NOT NULL DEFAULT 'author'
    CHECK (instructor_role IN ('author', 'co_author', 'editor')),
  PRIMARY KEY (course_id, user_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS course_categories (
  course_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY (course_id, category_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS course_sections (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (course_id, position),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  section_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  content_format TEXT NOT NULL DEFAULT 'rich_text'
    CHECK (content_format IN ('rich_text', 'markdown', 'html', 'external')),
  content_body TEXT,
  estimated_minutes INTEGER,
  is_preview INTEGER NOT NULL DEFAULT 0 CHECK (is_preview IN (0, 1)),
  position INTEGER NOT NULL,
  publish_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (course_id, position),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES course_sections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS lesson_assets (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  asset_type TEXT NOT NULL
    CHECK (asset_type IN ('image', 'video', 'audio', 'file', 'link')),
  storage_url TEXT NOT NULL,
  title TEXT,
  mime_type TEXT,
  metadata_json TEXT,                         -- future-safe blob for provider-specific fields
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_tags (
  course_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (course_id, tag_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- Assessment: quizzes, questions, attempts, grading
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  passing_score_percent REAL,                 -- null means no passing threshold
  max_attempts INTEGER,                       -- null means unlimited
  time_limit_sec INTEGER,
  shuffle_questions INTEGER NOT NULL DEFAULT 0 CHECK (shuffle_questions IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  question_type TEXT NOT NULL
    CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false', 'short_text', 'numeric')),
  prompt TEXT NOT NULL,
  explanation TEXT,
  points REAL NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  payload_json TEXT,                          -- extension point for rich question settings
  UNIQUE (quiz_id, position),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_question_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  option_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL,
  payload_json TEXT,
  UNIQUE (question_id, position),
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  score_percent REAL,
  total_points REAL,
  earned_points REAL,
  passed INTEGER CHECK (passed IN (0, 1)),
  feedback_summary TEXT,
  UNIQUE (quiz_id, user_id, attempt_no),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_payload_json TEXT NOT NULL,          -- supports all question types
  is_correct INTEGER CHECK (is_correct IN (0, 1)),
  earned_points REAL,
  FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE,
  UNIQUE (attempt_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Learning progress and enrollment
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  enrollment_type TEXT NOT NULL DEFAULT 'self'
    CHECK (enrollment_type IN ('self', 'teacher_assigned', 'group_assigned', 'purchase')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'dropped')),
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  progress_percent REAL NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  last_lesson_id TEXT,
  UNIQUE (user_id, course_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (last_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TEXT,
  completed_at TEXT,
  time_spent_sec INTEGER NOT NULL DEFAULT 0,
  last_position_json TEXT,
  UNIQUE (user_id, lesson_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Groups and classes (student + teacher workflows)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS learning_groups (
  id TEXT PRIMARY KEY,
  owner_teacher_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  join_code TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_teacher_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS learning_group_members (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  member_role TEXT NOT NULL
    CHECK (member_role IN ('teacher', 'assistant', 'student')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES learning_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_course_assignments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  due_at TEXT,
  is_mandatory INTEGER NOT NULL DEFAULT 1 CHECK (is_mandatory IN (0, 1)),
  UNIQUE (group_id, course_id),
  FOREIGN KEY (group_id) REFERENCES learning_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- Social and quality signals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS course_reviews (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (course_id, user_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Commerce (minimal but extensible)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  buyer_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'canceled')),
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payment_provider TEXT,
  payment_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'course'
    CHECK (product_type IN ('course')),
  course_id TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- Notifications and audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload_json TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Suggested seed data
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO roles (id, code, name) VALUES
  (1, 'personal', 'Personal Use'),
  (2, 'student',  'Student'),
  (3, 'teacher',  'Teacher'),
  (4, 'admin',    'Administrator');

-- ---------------------------------------------------------------------------
-- Indexes (search and analytics hot paths)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_courses_owner ON courses(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(publish_status, visibility);
CREATE INDEX IF NOT EXISTS idx_courses_title ON courses(title);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id, status);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON learning_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_log(actor_user_id, created_at);

COMMIT;
