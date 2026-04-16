import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'intelections.db');
const uploadsDir = path.join(__dirname, 'uploads');
const materialsUploadDir = path.join(uploadsDir, 'materials');
const FREE_COURSE_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const PLUS_COURSE_STORAGE_LIMIT_BYTES = 25 * 1024 * 1024 * 1024;
const DEFAULT_DEMO_PASSWORD = process.env.DEFAULT_DEMO_PASSWORD || 'Intelections123!';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function ensureDirectory() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some(column => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function backfillPasswordHashes(db) {
  const rows = db.prepare(`
    SELECT id
    FROM users
    WHERE COALESCE(password_hash, '') = ''
  `).all();

  if (rows.length === 0) return;

  const update = db.prepare(`
    UPDATE users
    SET password_hash = ?, password_updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const row of rows) {
    update.run(hashPassword(DEFAULT_DEMO_PASSWORD), row.id);
  }
}

function seedIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count > 0) return;

  db.exec(`
    INSERT INTO users (id, email, first_name, last_name, role, bio, location, birth_date, avatar_url) VALUES
      ('u-1', 'vlad@example.com', 'Vlad', 'Surname', 'Student', 'History enthusiast. Learning daily.', 'Rzeszow, PL', '2004-03-10', ''),
      ('u-3', 'jan@example.com', 'Jan', 'Nowak', 'Teacher', 'Ancient world researcher.', 'Krakow, PL', '1982-02-02', ''),
      ('u-10', 'tomasz@example.com', 'Tomasz', 'Baran', 'Personal', 'Humanities creator building compact literature and ethics paths.', 'Opole, PL', '1993-08-09', '');

    INSERT INTO courses (
      id, title, description, author_user_id, category, level, publish_status, visibility, access_type,
      price_cents, currency, country, is_trending, is_popular_pl
    ) VALUES
      ('world-history-18c', 'World History: 18th Century', 'Key events shaping the 18th century world.', 'u-3', 'History', 'intermediate', 'published', 'public', 'free', NULL, NULL, 'PL', 1, 1),
      ('ancient-civ', 'Ancient Civilizations', 'Introduction to Mesopotamia, Egypt, Greece and Rome.', 'u-3', 'History', 'beginner', 'published', 'public', 'free', NULL, NULL, 'PL', 1, 1),
      ('modern-europe-1900-1945', 'Modern Europe 1900-1945', 'Overview of Europe in the first half of the 20th century.', 'u-3', 'History', 'intermediate', 'draft', 'private', 'free', NULL, NULL, 'PL', 0, 0),
      ('renaissance-art', 'Renaissance Art', 'Art movements and iconic works of the Renaissance period.', 'u-10', 'Art', 'beginner', 'published', 'public', 'paid', 2999, 'PLN', 'PL', 1, 0),
      ('intro-philosophy', 'Intro to Philosophy', 'Main schools of thought and key philosophers.', 'u-10', 'Humanities', 'beginner', 'published', 'public', 'free', NULL, NULL, 'PL', 1, 0),
      ('geography-poland', 'Geography of Poland', 'Regions, climate and natural resources of Poland.', 'u-3', 'Geography', 'beginner', 'published', 'public', 'free', NULL, NULL, 'PL', 0, 1);

    INSERT INTO course_stats (course_id, students, rating, reviews) VALUES
      ('world-history-18c', 920, 4.6, 132),
      ('ancient-civ', 1280, 4.7, 214),
      ('modern-europe-1900-1945', 0, 0, 0),
      ('renaissance-art', 540, 4.5, 88),
      ('intro-philosophy', 610, 4.4, 75),
      ('geography-poland', 480, 4.3, 59);

    INSERT INTO lessons (id, course_id, title, duration_min, is_free_preview, position) VALUES
      ('l1', 'ancient-civ', 'Introduction & Sources', 12, 1, 1),
      ('l2', 'ancient-civ', 'Mesopotamia - City-States', 18, 0, 2),
      ('l3', 'ancient-civ', 'Ancient Egypt - Kingdoms & Pharaohs', 22, 0, 3),
      ('l4', 'ancient-civ', 'Classical Greece - Polis & Culture', 20, 0, 4),
      ('l5', 'ancient-civ', 'The Roman Republic & Empire', 24, 0, 5),
      ('l6', 'ancient-civ', 'Legacy & Influence', 14, 0, 6);

    INSERT INTO recent_visits (user_id, course_id, visited_at) VALUES
      ('u-1', 'world-history-18c', datetime('now', '-1 day')),
      ('u-1', 'ancient-civ', datetime('now', '-2 day')),
      ('u-1', 'modern-europe-1900-1945', datetime('now', '-3 day'));

    INSERT INTO course_stars (user_id, course_id) VALUES
      ('u-1', 'world-history-18c');
  `);
}

function backfillAuthorProfiles(db) {
  const authorProfiles = [
    {
      userId: 'u-3',
      headline: 'Researcher in ancient civilizations and author of intro humanities courses',
      website: 'https://intelections.local/jan',
      institution: 'Jagiellonian University',
      specialization: 'Ancient History',
      bio: 'My profile focuses on making ancient history readable and structured for students who are just starting out. I enjoy turning complex source material into clear lesson sequences, timelines and short explanatory modules.',
      location: 'Krakow, PL',
      achievements: [
        ['ach-profile-u3-1', 'Conference speaker on ancient societies', 'Krakow Humanities Forum', '2024', 1],
        ['ach-profile-u3-2', 'Created a beginner-friendly ancient history path', 'InteLections', '2025', 2],
      ],
      certificates: [
        ['cert-profile-u3-1', 'Historical Research Methods', 'edX', '2022', 'https://example.com/cert/jan-research', 1],
        ['cert-profile-u3-2', 'Academic Writing for Humanities', 'FutureLearn', '2021', 'https://example.com/cert/jan-writing', 2],
      ],
      activities: [
        ['act-profile-u3-1', 'Field research assistant', 'Mediterranean Heritage Project', 'Worked on educational materials inspired by archaeological field notes.', '2023', 1],
        ['act-profile-u3-2', 'Guest lecturer', 'Open Humanities Week', 'Presented a short lecture series about primary sources in antiquity.', '2024', 2],
      ],
      socials: [
        ['social-profile-u3-1', 'linkedin', 'https://linkedin.com/in/jannowak-history', 1],
      ],
    },
    {
      userId: 'u-10',
      headline: 'Humanities creator focused on literature, ethics and close reading',
      website: 'https://intelections.local/tomasz',
      institution: 'Independent Creator',
      specialization: 'Humanities and Interpretation',
      bio: 'I create compact humanities courses that help learners work with symbols, moral dilemmas and careful interpretation of texts without academic overload.',
      location: 'Opole, PL',
      achievements: [
        ['ach-profile-u10-1', 'Built compact humanities learning paths', 'InteLections', '2025', 1],
      ],
      certificates: [
        ['cert-profile-u10-1', 'Literary Interpretation Essentials', 'Open Learning Lab', '2024', 'https://example.com/cert/tomasz-literature', 1],
      ],
      activities: [
        ['act-profile-u10-1', 'Reading workshop organizer', 'Local Humanities Circle', 'Led short discussion-based sessions on symbols, motifs and ethical interpretation.', '2025', 1],
      ],
      socials: [
        ['social-profile-u10-1', 'linkedin', 'https://linkedin.com/in/tomasz-baran-humanities', 1],
      ],
    },
  ];

  const updateUser = db.prepare(`
    UPDATE users
    SET headline = COALESCE(NULLIF(headline, ''), ?),
        website = COALESCE(NULLIF(website, ''), ?),
        institution = COALESCE(NULLIF(institution, ''), ?),
        specialization = COALESCE(NULLIF(specialization, ''), ?),
        bio = COALESCE(NULLIF(bio, ''), ?),
        location = COALESCE(NULLIF(location, ''), ?)
    WHERE id = ?
  `);

  const hasRows = (tableName, userId) => {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE user_id = ?`).get(userId);
    return Number(row?.count || 0) > 0;
  };

  const insertAchievement = db.prepare(`
    INSERT OR IGNORE INTO user_achievements (id, user_id, title, organization, year_label, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertCertificate = db.prepare(`
    INSERT OR IGNORE INTO user_certificates (id, user_id, title, issuer, year_label, credential_url, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertActivity = db.prepare(`
    INSERT OR IGNORE INTO user_activities (id, user_id, title, organization, description, year_label, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSocial = db.prepare(`
    INSERT OR IGNORE INTO user_social_links (id, user_id, platform, url, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const profile of authorProfiles) {
    const exists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(profile.userId);
    if (!exists) continue;

    updateUser.run(
      profile.headline,
      profile.website,
      profile.institution,
      profile.specialization,
      profile.bio,
      profile.location,
      profile.userId,
    );

    if (!hasRows('user_achievements', profile.userId)) {
      for (const row of profile.achievements) {
        insertAchievement.run(...row.slice(0, 1), profile.userId, ...row.slice(1));
      }
    }

    if (!hasRows('user_certificates', profile.userId)) {
      for (const row of profile.certificates) {
        insertCertificate.run(...row.slice(0, 1), profile.userId, ...row.slice(1));
      }
    }

    if (!hasRows('user_activities', profile.userId)) {
      for (const row of profile.activities) {
        insertActivity.run(...row.slice(0, 1), profile.userId, ...row.slice(1));
      }
    }

    if (!hasRows('user_social_links', profile.userId)) {
      for (const row of profile.socials) {
        insertSocial.run(...row.slice(0, 1), profile.userId, ...row.slice(1));
      }
    }
  }
}


function backfillLearningGroups(db) {
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM learning_groups').get().count || 0);
  if (count > 0) return;

  const requiredUsers = ['u-1', 'u-3'];
  const missingUser = requiredUsers.some(userId => !db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId));
  if (missingUser) return;

  db.exec(`
    INSERT INTO learning_groups (
      id, owner_user_id, name, description, focus_area, meeting_label, location_label, invite_code
    ) VALUES
      (
        'group-ancient-seminar',
        'u-3',
        'Ancient Sources Seminar',
        'A slower-paced seminar for source reading, timeline work and guided discussion around antiquity.',
        'Ancient Civilizations',
        'Wed 16:15',
        'Digital classroom',
        'ANTIQUITY-7'
      );

    INSERT INTO learning_group_members (group_id, user_id, member_role, status) VALUES
      ('group-ancient-seminar', 'u-3', 'teacher', 'active'),
      ('group-ancient-seminar', 'u-1', 'student', 'active');

    INSERT INTO group_course_assignments (
      id, group_id, course_id, assigned_by_user_id, cadence_label, due_label
    ) VALUES
      (
        'assignment-ancient-seminar-civ',
        'group-ancient-seminar',
        'ancient-civ',
        'u-3',
        'One lesson per week',
        'Discussion notes before Wednesday'
      ),
      (
        'assignment-ancient-seminar-philosophy',
        'group-ancient-seminar',
        'intro-philosophy',
        'u-3',
        'Context companion course',
        'Optional enrichment'
      );

    INSERT OR IGNORE INTO course_enrollments (id, course_id, user_id, status) VALUES
      ('seed-enrollment-world-history', 'world-history-18c', 'u-1', 'active'),
      ('seed-enrollment-ancient-civ', 'ancient-civ', 'u-1', 'active');
  `);
}

function backfillAncientEgyptQuiz(db) {
  const lesson = db.prepare(`
    SELECT l.id, c.author_user_id AS authorUserId
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = 'l3'
  `).get();

  if (!lesson || lesson.authorUserId !== 'u-3') return;

  const existingQuiz = db.prepare('SELECT id FROM lesson_quizzes WHERE lesson_id = ?').get('l3');
  if (existingQuiz) return;

  const quizId = 'quiz-egypt-kingdoms-pharaohs';

  db.prepare(`
    INSERT INTO lesson_quizzes (id, lesson_id, title, description, passing_score, time_limit_min)
    VALUES (?, 'l3', ?, ?, ?, ?)
  `).run(
    quizId,
    'Ancient Egypt: kingdoms and pharaohs',
    'A focused check on the Old, Middle and New Kingdoms, the role of pharaohs, and the importance of the Nile.',
    70,
    12,
  );

  const insertQuestion = db.prepare(`
    INSERT INTO lesson_quiz_questions (id, quiz_id, prompt, question_type, accepted_answer, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertOption = db.prepare(`
    INSERT INTO lesson_quiz_options (id, question_id, option_text, is_correct, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertQuestion.run('q-egypt-1', quizId, 'Which natural feature made large-scale agriculture possible in ancient Egypt?', 'single-choice', '', 1);
  insertOption.run('q-egypt-1-a', 'q-egypt-1', 'The Nile River', 1, 1);
  insertOption.run('q-egypt-1-b', 'q-egypt-1', 'The Mediterranean Sea', 0, 2);
  insertOption.run('q-egypt-1-c', 'q-egypt-1', 'The Red Sea', 0, 3);
  insertOption.run('q-egypt-1-d', 'q-egypt-1', 'The Sahara dunes', 0, 4);

  insertQuestion.run('q-egypt-2', quizId, 'Which statements correctly describe the pharaoh in ancient Egypt?', 'multi-select', '', 2);
  insertOption.run('q-egypt-2-a', 'q-egypt-2', 'The pharaoh was seen as both a political and religious leader.', 1, 1);
  insertOption.run('q-egypt-2-b', 'q-egypt-2', 'The pharaoh was responsible for preserving order in the land.', 1, 2);
  insertOption.run('q-egypt-2-c', 'q-egypt-2', 'The pharaoh was elected every four years by citizens.', 0, 3);
  insertOption.run('q-egypt-2-d', 'q-egypt-2', 'The pharaoh had no connection to temples or rituals.', 0, 4);

  insertQuestion.run('q-egypt-3', quizId, 'The New Kingdom is often associated with expansion, military strength, and famous rulers like Ramesses II.', 'true-false', '', 3);
  insertOption.run('q-egypt-3-a', 'q-egypt-3', 'True', 1, 1);
  insertOption.run('q-egypt-3-b', 'q-egypt-3', 'False', 0, 2);

  insertQuestion.run('q-egypt-4', quizId, 'Write the title used for the ruler of ancient Egypt.', 'open-answer', 'pharaoh\npharaohs', 4);

  insertQuestion.run('q-egypt-5', quizId, 'Which period came first in the traditional sequence of the major Egyptian kingdoms?', 'single-choice', '', 5);
  insertOption.run('q-egypt-5-a', 'q-egypt-5', 'Old Kingdom', 1, 1);
  insertOption.run('q-egypt-5-b', 'q-egypt-5', 'Middle Kingdom', 0, 2);
  insertOption.run('q-egypt-5-c', 'q-egypt-5', 'New Kingdom', 0, 3);
  insertOption.run('q-egypt-5-d', 'q-egypt-5', 'Late Period', 0, 4);
}

function ensureBackfillMaterialFile(fileName, contents) {
  fs.mkdirSync(materialsUploadDir, { recursive: true });
  const filePath = path.join(materialsUploadDir, fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, contents, 'utf8');
  }
  return {
    absolutePath: filePath,
    publicPath: `/uploads/materials/${fileName}`,
  };
}

function backfillAncientEgyptMaterials(db) {
  db.prepare('DELETE FROM lesson_materials WHERE lesson_id = ?').run('l4');
  db.prepare('DELETE FROM lesson_material_sections WHERE lesson_id = ?').run('l4');

  const lesson = db.prepare(`
    SELECT l.id, c.author_user_id AS authorUserId
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = 'l3'
  `).get();

  if (!lesson || lesson.authorUserId !== 'u-3') return;

  const materialCount = db.prepare('SELECT COUNT(*) AS count FROM lesson_materials WHERE lesson_id = ?').get('l3');
  if (Number(materialCount?.count || 0) > 0) return;

  db.prepare(`
    INSERT OR IGNORE INTO lesson_material_sections (id, lesson_id, title, description, sort_order)
    VALUES
      ('sec-egypt-kingdoms', 'l3', 'Kingdoms and chronology', 'The main periods of ancient Egyptian history and their order.', 1)
  `).run();

  const kingdomsNotes = ensureBackfillMaterialFile(
    'ancient-egypt-kingdoms-notes.txt',
    [
      'Ancient Egypt - Kingdoms and Pharaohs',
      '',
      'Key reminders:',
      '- The Old Kingdom came first, followed by the Middle and New Kingdom.',
      '- The Nile made agriculture and long-term state organization possible.',
      '- Political stability changed across periods, but the pharaoh remained the symbolic center of the state.',
    ].join('\n'),
  );

  db.prepare(`
    INSERT OR IGNORE INTO lesson_materials (
      id, lesson_id, title, material_kind, file_path, original_name, description, mime_type, file_size_bytes, external_url, section_id, sort_order
    ) VALUES
      (?, 'l3', ?, 'document', ?, ?, ?, 'text/plain', ?, '', 'sec-egypt-kingdoms', 1)
  `).run(
    'mat-egypt-kingdoms-notes',
    'Egyptian kingdoms - timeline and structure',
    kingdomsNotes.publicPath,
    'ancient-egypt-kingdoms-notes.txt',
    'Summarises the Old, Middle and New Kingdoms, explains their order and highlights the role of the Nile in state continuity.',
    Buffer.byteLength(fs.readFileSync(kingdomsNotes.absolutePath, 'utf8'))
  );
}
function backfillDefenseDemoAccounts(db) {
  db.exec(`
    INSERT OR IGNORE INTO users (id, email, first_name, last_name, role, bio, location, birth_date, avatar_url) VALUES
      ('u-admin-demo', 'admin@intelections.local', 'Admin', '', 'Admin', 'Admin reviewer account for marketplace, billing and premium content moderation during defense demos.', 'Rzeszow, PL', '1990-05-17', '');
  `);

  db.prepare(`
    UPDATE users
    SET first_name = 'Admin',
        last_name = ''
    WHERE id = 'u-admin-demo' OR lower(email) = 'admin@intelections.local'
  `).run();
}

function backfillLessonMaterialSortOrder(db) {
  const lessons = db.prepare('SELECT id FROM lessons ORDER BY id ASC').all();
  const updateSortOrder = db.prepare('UPDATE lesson_materials SET sort_order = ? WHERE id = ?');

  for (const lesson of lessons) {
    const materials = db.prepare(`
      SELECT id
      FROM lesson_materials
      WHERE lesson_id = ?
      ORDER BY CASE WHEN sort_order > 0 THEN 0 ELSE 1 END, sort_order ASC, created_at ASC, rowid ASC
    `).all(lesson.id);

    materials.forEach((material, index) => {
      updateSortOrder.run(index + 1, material.id);
    });
  }
}

function backfillLegacyLooseMaterialSections(db) {
  const legacySections = db.prepare(`
    SELECT id
    FROM lesson_material_sections
    WHERE lower(trim(title)) IN ('loose materials', 'loose material')
  `).all();

  if (legacySections.length === 0) return;

  const detachMaterials = db.prepare('UPDATE lesson_materials SET section_id = NULL WHERE section_id = ?');
  const deleteSection = db.prepare('DELETE FROM lesson_material_sections WHERE id = ?');

  for (const section of legacySections) {
    detachMaterials.run(section.id);
    deleteSection.run(section.id);
  }
}

function backfillCreatorSubscriptions(db) {
  db.prepare(`
    UPDATE users
    SET subscription_plan = 'plus',
        subscription_started_at = COALESCE(subscription_started_at, datetime('now'))
    WHERE id IN (SELECT DISTINCT author_user_id FROM courses)
      AND id <> 'u-10'
      AND COALESCE(subscription_plan, 'free') = 'free'
  `).run();

  db.prepare(`
    UPDATE users
    SET subscription_plan = 'free',
        subscription_started_at = NULL
    WHERE id = 'u-10'
  `).run();
}

function backfillCourseStorageCache(db) {
  db.exec(`
    INSERT OR IGNORE INTO course_stats (course_id, students, rating, reviews, storage_used_bytes, storage_limit_bytes)
    SELECT id, 0, 0, 0, 0, 0
    FROM courses;
  `);

  db.exec(`
    UPDATE course_stats
    SET storage_used_bytes = (
          COALESCE((
            SELECT SUM(COALESCE(m.file_size_bytes, 0))
            FROM lesson_materials m
            JOIN lessons l ON l.id = m.lesson_id
            WHERE l.course_id = course_stats.course_id
          ), 0)
          +
          COALESCE((
            SELECT SUM(COALESCE(clm.file_size_bytes, 0))
            FROM course_learner_materials clm
            WHERE clm.course_id = course_stats.course_id
          ), 0)
        ),
        storage_limit_bytes = COALESCE((
          SELECT CASE
            WHEN lower(COALESCE(u.subscription_plan, 'free')) = 'plus' THEN 26843545600
            ELSE 5368709120
          END
          FROM courses c
          JOIN users u ON u.id = c.author_user_id
          WHERE c.id = course_stats.course_id
        ), 5368709120)
    WHERE EXISTS (
      SELECT 1
      FROM courses c
      WHERE c.id = course_stats.course_id
    );
  `);
}

export function openDatabase() {
  ensureDirectory();
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL,
      subscription_plan TEXT NOT NULL DEFAULT 'free',
      subscription_started_at TEXT DEFAULT NULL,
      bio TEXT,
      location TEXT,
      birth_date TEXT,
      avatar_url TEXT DEFAULT '',
      headline TEXT DEFAULT '',
      website TEXT DEFAULT '',
      institution TEXT DEFAULT '',
      specialization TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS oauth_identities (
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (provider, provider_user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      author_user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      publish_status TEXT NOT NULL CHECK (publish_status IN ('draft', 'published', 'archived')),
      visibility TEXT NOT NULL CHECK (visibility IN ('public', 'unlisted', 'private')),
      access_type TEXT NOT NULL CHECK (access_type IN ('free', 'paid')),
      price_cents INTEGER,
      currency TEXT,
      country TEXT DEFAULT 'PL',
      is_trending INTEGER NOT NULL DEFAULT 0 CHECK (is_trending IN (0, 1)),
      is_popular_pl INTEGER NOT NULL DEFAULT 0 CHECK (is_popular_pl IN (0, 1)),
      FOREIGN KEY (author_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS course_stats (
      course_id TEXT PRIMARY KEY,
      students INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 0,
      reviews INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_ratings (
      course_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (course_id, user_id),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      is_free_preview INTEGER NOT NULL DEFAULT 0 CHECK (is_free_preview IN (0, 1)),
      position INTEGER NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lesson_material_sections (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_paid_content INTEGER NOT NULL DEFAULT 0 CHECK (is_paid_content IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lesson_materials (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      title TEXT NOT NULL,
      material_kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      mime_type TEXT DEFAULT '',
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      section_id TEXT DEFAULT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lesson_quizzes (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      passing_score INTEGER NOT NULL DEFAULT 60,
      time_limit_min INTEGER,
      max_attempts INTEGER,
      access_scope TEXT NOT NULL DEFAULT 'course',
      access_group_id TEXT DEFAULT NULL,
      available_from TEXT DEFAULT NULL,
      available_to TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lesson_quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'single-choice',
      accepted_answer TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (quiz_id) REFERENCES lesson_quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lesson_quiz_options (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      option_text TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES lesson_quiz_questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_enrollments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(course_id, user_id),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      score_percent INTEGER NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0 CHECK (passed IN (0, 1)),
      total_questions INTEGER NOT NULL DEFAULT 0,
      correct_answers INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (quiz_id) REFERENCES lesson_quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer_text TEXT DEFAULT '',
      selected_option_ids TEXT DEFAULT '',
      is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
      FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES lesson_quiz_questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recent_visits (
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      visited_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, course_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_courses (
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      PRIMARY KEY (user_id, course_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_stars (
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, course_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      organization TEXT DEFAULT '',
      year_label TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_certificates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      issuer TEXT DEFAULT '',
      year_label TEXT DEFAULT '',
      credential_url TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_activities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      organization TEXT DEFAULT '',
      description TEXT DEFAULT '',
      year_label TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_social_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learning_groups (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      focus_area TEXT DEFAULT '',
      meeting_label TEXT DEFAULT '',
      location_label TEXT DEFAULT '',
      room_link TEXT DEFAULT '',
      invite_code TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learning_group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      member_role TEXT NOT NULL DEFAULT 'student',
      status TEXT NOT NULL DEFAULT 'active',
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
      cadence_label TEXT DEFAULT '',
      due_label TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (group_id) REFERENCES learning_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_group_invites (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_user_id TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      responded_at TEXT DEFAULT NULL,
      FOREIGN KEY (group_id) REFERENCES learning_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_ui_preferences (
      user_id TEXT PRIMARY KEY,
      hide_class_invite_messages INTEGER NOT NULL DEFAULT 0 CHECK (hide_class_invite_messages IN (0, 1)),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_learner_materials (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT DEFAULT '',
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_monthly_usage (
      user_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, month_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS billing_customers (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS billing_subscriptions (
      stripe_subscription_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      stripe_customer_id TEXT NOT NULL,
      plan_key TEXT NOT NULL DEFAULT 'intelections_plus',
      status TEXT NOT NULL,
      current_period_end TEXT DEFAULT NULL,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS seller_stripe_accounts (
      user_id TEXT PRIMARY KEY,
      stripe_account_id TEXT NOT NULL UNIQUE,
      details_submitted INTEGER NOT NULL DEFAULT 0 CHECK (details_submitted IN (0, 1)),
      charges_enabled INTEGER NOT NULL DEFAULT 0 CHECK (charges_enabled IN (0, 1)),
      payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payouts_enabled IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS course_purchases (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      stripe_checkout_session_id TEXT NOT NULL UNIQUE,
      stripe_payment_intent_id TEXT DEFAULT '',
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'PLN',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  ensureColumn(db, 'users', 'headline', "TEXT DEFAULT ''");
  ensureColumn(db, 'courses', 'thumbnail_url', "TEXT DEFAULT ''");
  ensureColumn(db, 'courses', 'template_key', "TEXT DEFAULT 'classic'");
  ensureColumn(db, 'courses', 'allow_learner_uploads', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'courses', 'learner_upload_note', "TEXT DEFAULT ''");
  ensureColumn(db, 'courses', 'publish_blocked', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'courses', 'publish_block_message', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'website', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'institution', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'specialization', "TEXT DEFAULT ''");
  ensureColumn(db, 'lesson_materials', 'description', "TEXT DEFAULT ''");
  ensureColumn(db, 'lesson_materials', 'external_url', "TEXT DEFAULT ''");
  ensureColumn(db, 'lesson_materials', 'section_id', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'lesson_materials', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'lesson_material_sections', 'is_paid_content', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'lesson_quizzes', 'max_attempts', 'INTEGER');
  ensureColumn(db, 'lesson_quizzes', 'access_scope', "TEXT NOT NULL DEFAULT 'course'");
  ensureColumn(db, 'lesson_quizzes', 'access_group_id', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'lesson_quizzes', 'available_from', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'lesson_quizzes', 'available_to', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'learning_groups', 'room_link', "TEXT DEFAULT ''");
  ensureColumn(db, 'lesson_quiz_questions', 'accepted_answer', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'subscription_plan', "TEXT NOT NULL DEFAULT 'free'");
  ensureColumn(db, 'users', 'subscription_started_at', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'users', 'password_hash', "TEXT DEFAULT ''");
  ensureColumn(db, 'users', 'password_updated_at', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'users', 'profile_blocked', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'lesson_materials', 'video_duration_seconds', 'INTEGER DEFAULT NULL');
  ensureColumn(db, 'course_ratings', 'review_title', "TEXT DEFAULT ''");
  ensureColumn(db, 'course_ratings', 'review_text', "TEXT DEFAULT ''");
  ensureColumn(db, 'course_stats', 'storage_used_bytes', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'course_stats', 'storage_limit_bytes', 'INTEGER NOT NULL DEFAULT 5368709120');

  backfillPasswordHashes(db);
  seedIfEmpty(db);
  backfillAuthorProfiles(db);
  backfillLearningGroups(db);
  backfillAncientEgyptQuiz(db);
  backfillAncientEgyptMaterials(db);
  backfillDefenseDemoAccounts(db);
  backfillLessonMaterialSortOrder(db);
  backfillLegacyLooseMaterialSections(db);
  backfillCreatorSubscriptions(db);
  backfillCourseStorageCache(db);

  return db;
}













