import OpenAI from 'openai';
import { sanitizeGeneratedQuizDraft, validateLessonQuizDraft } from '../domain.mjs';

const QUIZ_GENERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'passingScore', 'timeLimitMin', 'maxAttempts', 'questions'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    passingScore: { type: 'number' },
    timeLimitMin: { type: ['number', 'null'] },
    maxAttempts: { type: ['number', 'null'] },
    questions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt', 'questionType', 'acceptedAnswer', 'options'],
        properties: {
          prompt: { type: 'string' },
          questionType: { type: 'string', enum: ['single-choice', 'multi-select', 'true-false', 'open-answer'] },
          acceptedAnswer: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'isCorrect'],
              properties: {
                text: { type: 'string' },
                isCorrect: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};

function extractOpenAiUsage(response = {}) {
  const usage = response?.usage ?? {};
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens ?? (inputTokens + outputTokens));

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function normalizeQuestionCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(3, Math.min(10, Math.round(numeric)));
}

function normalizeDifficulty(value, sanitizeText) {
  const normalized = sanitizeText(value).toLowerCase();
  return ['easy', 'mixed', 'challenging'].includes(normalized) ? normalized : 'mixed';
}

function normalizeQuestionTypes(value, sanitizeText) {
  const allowedTypes = ['single-choice', 'multi-select', 'true-false', 'open-answer'];
  const items = Array.isArray(value) ? value : [];
  const normalized = Array.from(new Set(
    items
      .map(item => sanitizeText(item))
      .filter(item => allowedTypes.includes(item))
  ));

  return normalized.length > 0 ? normalized : ['single-choice', 'multi-select'];
}

export function createQuizAiService(config, deps) {
  const {
    apiKey = '',
    model = 'gpt-5-mini',
  } = config;

  const {
    db,
    sanitizeText,
    hasIntelectionsPlus,
    getAiMonthlyTokenLimit,
    getAiMonthlyUsage,
    recordAiMonthlyUsage,
  } = deps;

  const openai = apiKey ? new OpenAI({ apiKey }) : null;

  function isConfigured() {
    return Boolean(apiKey && openai);
  }

  function getQuizGenerationAvailability(user = null) {
    if (!apiKey) {
      return {
        available: false,
        reason: 'Add OPENAI_API_KEY on the backend to generate editable quiz drafts with AI.',
      };
    }
    if (user && !hasIntelectionsPlus(user)) {
      return {
        available: false,
        reason: 'AI quiz generation is part of InteLections+ for course owners.',
      };
    }
    if (user) {
      const monthlyLimit = getAiMonthlyTokenLimit(user);
      if (monthlyLimit > 0) {
        const usage = getAiMonthlyUsage(user.id);
        if (usage.totalTokens >= monthlyLimit) {
          return {
            available: false,
            reason: 'The monthly InteLections+ AI limit has been reached for this account (1,000,000 tokens).',
          };
        }
      }
    }
    return { available: true, reason: '' };
  }

  function buildLessonQuizGenerationContext(lessonId) {
    const lesson = db.prepare(`
      SELECT l.id, l.title, l.duration_min AS durationMin,
             c.id AS courseId, c.title AS courseTitle, c.category, c.level,
             q.title AS existingQuizTitle, q.description AS existingQuizDescription
      FROM lessons l
      JOIN courses c ON c.id = l.course_id
      LEFT JOIN lesson_quizzes q ON q.lesson_id = l.id
      WHERE l.id = ?
    `).get(lessonId);

    if (!lesson) return null;

    const materials = db.prepare(`
      SELECT title, description, material_kind AS materialKind
      FROM lesson_materials
      WHERE lesson_id = ?
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `).all(lessonId).map(item => ({
      title: item.title,
      description: item.description || '',
      materialKind: item.materialKind,
    }));

    return {
      lessonId: lesson.id,
      courseId: lesson.courseId,
      courseTitle: lesson.courseTitle,
      category: lesson.category,
      level: lesson.level,
      lessonTitle: lesson.title,
      durationMin: Number(lesson.durationMin || 0),
      existingQuizTitle: lesson.existingQuizTitle || '',
      existingQuizDescription: lesson.existingQuizDescription || '',
      materials,
    };
  }

  async function generateQuizDraftWithOpenAI(context, controls, userId = '') {
    if (!openai) {
      throw new Error(getQuizGenerationAvailability().reason || 'OpenAI quiz generation is not configured');
    }

    const preferredQuestionTypes = normalizeQuestionTypes(controls?.preferredQuestionTypes, sanitizeText);
    const generationPrompt = [
      'You create lesson quizzes for a web learning platform.',
      'Generate a grounded quiz using only the provided lesson context.',
      'Do not invent facts that are not reasonably supported by the lesson metadata and material descriptions.',
      'Keep the quiz compatible with the app schema.',
      'Prefer single-choice and multi-select questions unless another supported type clearly helps.',
      'True-false questions must contain exactly two options: True and False.',
      'Open-answer questions must include one or more accepted answers in a single string separated by new lines.',
      'Avoid ambiguous distractors and avoid overly tricky wording.',
    ].join(' ');

    const response = await openai.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: generationPrompt }],
        },
        {
          role: 'user',
          content: [{
            type: 'input_text',
            text: JSON.stringify({
              controls: {
                questionCount: normalizeQuestionCount(controls?.questionCount),
                difficulty: normalizeDifficulty(controls?.difficulty, sanitizeText),
                preferredQuestionTypes,
                teacherInstruction: sanitizeText(controls?.teacherInstruction),
              },
              context,
            }, null, 2),
          }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'lesson_quiz_draft',
          schema: QUIZ_GENERATION_SCHEMA,
          strict: true,
        },
      },
    });

    if (userId) {
      recordAiMonthlyUsage(userId, extractOpenAiUsage(response));
    }

    const outputText = String(response.output_text || '').trim();
    if (!outputText) {
      throw new Error('OpenAI did not return a quiz draft');
    }

    let parsedDraft;
    try {
      parsedDraft = JSON.parse(outputText);
    } catch {
      throw new Error('OpenAI returned an unreadable quiz draft');
    }

    try {
      return validateLessonQuizDraft(sanitizeGeneratedQuizDraft(parsedDraft));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Quiz validation failed';
      throw new Error(`Generated quiz needs revision before it can be used: ${detail}`);
    }
  }

  return {
    model,
    openai,
    isConfigured,
    getQuizGenerationAvailability,
    buildLessonQuizGenerationContext,
    generateQuizDraftWithOpenAI,
  };
}
