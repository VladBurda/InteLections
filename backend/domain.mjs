import crypto from 'node:crypto';

function sanitizeText(value) {
  return String(value || '').trim();
}

function slugId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeSubscriptionPlan(value) {
  const plan = sanitizeText(value).toLowerCase();
  return ['free', 'plus'].includes(plan) ? plan : 'free';
}

export function extractAcceptedAnswers(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[\r\n|]+/)
      .map(item => sanitizeText(item))
      .filter(Boolean)
  ));
}

export function parseYouTubeTimestampToSeconds(value) {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return 0;

  if (/^\d+$/.test(cleanValue)) {
    return Number(cleanValue);
  }

  let total = 0;
  const matches = cleanValue.match(/(\d+)(h|m|s)/gi);
  if (matches) {
    for (const token of matches) {
      const [, amount, unit] = token.match(/(\d+)(h|m|s)/i) || [];
      const numericAmount = Number(amount || 0);
      if (unit.toLowerCase() === 'h') total += numericAmount * 3600;
      if (unit.toLowerCase() === 'm') total += numericAmount * 60;
      if (unit.toLowerCase() === 's') total += numericAmount;
    }
    return total;
  }

  return 0;
}

export function extractYouTubeVideoConfig(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(rawValue);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
  let videoId = '';

  if (host === 'youtu.be') {
    videoId = parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parsedUrl.pathname === '/watch') {
      videoId = parsedUrl.searchParams.get('v') || '';
    } else if (parsedUrl.pathname.startsWith('/embed/')) {
      videoId = parsedUrl.pathname.split('/')[2] || '';
    } else if (parsedUrl.pathname.startsWith('/shorts/')) {
      videoId = parsedUrl.pathname.split('/')[2] || '';
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return null;
  }

  const searchTimestamp = parsedUrl.searchParams.get('t') || parsedUrl.searchParams.get('start') || '';
  const hashTimestamp = parsedUrl.hash.startsWith('#t=') ? parsedUrl.hash.slice(3) : '';
  const startSeconds = parseYouTubeTimestampToSeconds(searchTimestamp || hashTimestamp);

  return { videoId, startSeconds };
}

export function createYouTubeMaterial(item) {
  const config = extractYouTubeVideoConfig(item?.youtubeUrl);
  if (!config) {
    throw new Error('Enter a valid YouTube video link');
  }

  const title = sanitizeText(item?.title) || 'YouTube video';
  const description = sanitizeText(item?.description);
  const query = new URLSearchParams();
  query.set('rel', '0');
  if (config.startSeconds > 0) {
    query.set('start', String(config.startSeconds));
  }

  const externalUrl = `https://www.youtube.com/watch?v=${config.videoId}${config.startSeconds > 0 ? `&t=${config.startSeconds}s` : ''}`;

  return {
    id: `mat-${crypto.randomUUID()}`,
    title,
    materialKind: 'youtube',
    filePath: `https://www.youtube.com/embed/${config.videoId}?${query.toString()}`,
    externalUrl,
    originalName: 'YouTube video',
    description,
    mimeType: 'text/uri-list',
    fileSizeBytes: 0,
    videoDurationSeconds: null,
  };
}

function sanitizeQuizOption(item, index) {
  return {
    id: sanitizeText(item?.id) || slugId('quiz-option'),
    text: sanitizeText(item?.text),
    isCorrect: Boolean(item?.isCorrect),
    sortOrder: index + 1,
  };
}

function normalizeQuizQuestionType(value) {
  const rawType = sanitizeText(value);
  return ['single-choice', 'multi-select', 'true-false', 'open-answer'].includes(rawType)
    ? rawType
    : '';
}

function sanitizeQuizQuestionInternal(item, index, config = {}) {
  const rawType = sanitizeText(item?.questionType);
  const normalizedType = normalizeQuizQuestionType(rawType);
  if (config.strictType && !normalizedType) {
    throw new Error(`Question ${index + 1} uses an unsupported question type`);
  }

  const questionType = normalizedType || 'single-choice';

  let options = Array.isArray(item?.options)
    ? item.options.map((option, optionIndex) => sanitizeQuizOption(option, optionIndex)).filter(option => option.text)
    : [];

  if (questionType === 'true-false') {
    const trueOption = options.find(option => option.text.trim().toLowerCase() === 'true');
    const falseOption = options.find(option => option.text.trim().toLowerCase() === 'false');
    const trueIsCorrect = trueOption ? trueOption.isCorrect : !falseOption?.isCorrect;

    options = [
      { id: trueOption?.id || slugId('quiz-option'), text: 'True', isCorrect: Boolean(trueIsCorrect), sortOrder: 1 },
      { id: falseOption?.id || slugId('quiz-option'), text: 'False', isCorrect: !Boolean(trueIsCorrect), sortOrder: 2 },
    ];
  }

  if (questionType === 'open-answer') {
    options = [];
  }

  return {
    id: sanitizeText(item?.id) || slugId('quiz-question'),
    prompt: sanitizeText(item?.prompt),
    questionType,
    acceptedAnswer: questionType === 'open-answer' ? extractAcceptedAnswers(item?.acceptedAnswer).join('\\n') : '',
    sortOrder: index + 1,
    options,
  };
}

export function sanitizeQuizQuestion(item, index) {
  return sanitizeQuizQuestionInternal(item, index);
}

function toPositiveIntegerOrNull(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

export function sanitizeGeneratedQuizDraft(item) {
  const questions = Array.isArray(item?.questions)
    ? item.questions
      .map((question, index) => sanitizeQuizQuestionInternal(question, index, { strictType: true }))
      .filter(question => question.prompt)
    : [];

  const passingScore = Number(item?.passingScore);

  return {
    title: sanitizeText(item?.title) || 'AI-generated lesson test',
    description: sanitizeText(item?.description),
    passingScore: Number.isFinite(passingScore) ? Math.min(100, Math.max(1, Math.round(passingScore))) : 60,
    timeLimitMin: toPositiveIntegerOrNull(item?.timeLimitMin),
    maxAttempts: toPositiveIntegerOrNull(item?.maxAttempts),
    questions,
  };
}

export function validateLessonQuizDraft(draft) {
  const title = sanitizeText(draft?.title);
  const passingScore = Number(draft?.passingScore);
  const timeLimitMin = draft?.timeLimitMin == null ? null : Number(draft.timeLimitMin);
  const maxAttempts = draft?.maxAttempts == null ? null : Number(draft.maxAttempts);
  const questions = Array.isArray(draft?.questions) ? draft.questions : [];

  if (!title) {
    throw new Error('Test title is required');
  }
  if (!Number.isInteger(passingScore) || passingScore < 1 || passingScore > 100) {
    throw new Error('Passing score must be between 1 and 100');
  }
  if (timeLimitMin != null && (!Number.isInteger(timeLimitMin) || timeLimitMin <= 0)) {
    throw new Error('Time limit must be a positive number');
  }
  if (maxAttempts != null && (!Number.isInteger(maxAttempts) || maxAttempts <= 0)) {
    throw new Error('Attempts limit must be a positive number or left empty for unlimited');
  }
  if (questions.length === 0) {
    throw new Error('Add at least one question');
  }

  for (const [index, question] of questions.entries()) {
    if (!question.prompt) {
      throw new Error(`Question ${index + 1} needs a prompt`);
    }
    if (question.questionType === 'open-answer') {
      if (!question.acceptedAnswer) {
        throw new Error(`Question ${index + 1} needs at least one accepted answer`);
      }
      continue;
    }
    if (question.questionType === 'true-false') {
      if (question.options.length !== 2) {
        throw new Error(`Question ${index + 1} must contain exactly two true/false answers`);
      }
      if (question.options.filter(option => option.isCorrect).length !== 1) {
        throw new Error(`Question ${index + 1} must mark exactly one correct true/false answer`);
      }
      continue;
    }
    if (question.options.length < 2) {
      throw new Error(`Question ${index + 1} needs at least two answer options`);
    }
    if (!question.options.some(option => option.isCorrect)) {
      throw new Error(`Question ${index + 1} needs at least one correct answer`);
    }
    if (question.questionType === 'single-choice' && question.options.filter(option => option.isCorrect).length !== 1) {
      throw new Error(`Question ${index + 1} must have exactly one correct answer`);
    }
  }

  return {
    title,
    description: sanitizeText(draft?.description),
    passingScore,
    timeLimitMin,
    maxAttempts,
    questions,
  };
}

function normalizeAnswerForCompare(value) {
  return sanitizeText(value).replace(/\s+/g, ' ').toLowerCase();
}

export function scoreQuizAttempt(quiz, answers) {
  const submittedAnswers = Array.isArray(answers) ? answers : [];
  const byQuestionId = new Map(submittedAnswers.map(answer => [String(answer?.questionId || ''), answer]));
  const results = [];
  let correctAnswers = 0;

  for (const question of quiz.questions) {
    const answer = byQuestionId.get(question.id) || {};
    let isCorrect = false;
    let answerText = '';
    let selectedOptionIds = [];

    if (question.questionType === 'open-answer') {
      answerText = sanitizeText(answer.answerText);
      const acceptedAnswers = extractAcceptedAnswers(question.acceptedAnswer).map(normalizeAnswerForCompare);
      isCorrect = acceptedAnswers.includes(normalizeAnswerForCompare(answerText));
    } else {
      selectedOptionIds = Array.isArray(answer.selectedOptionIds)
        ? answer.selectedOptionIds.map(value => String(value))
        : [];
      const selectedSet = new Set(selectedOptionIds);
      const correctSet = new Set(question.options.filter(option => option.isCorrect).map(option => option.id));
      isCorrect = selectedSet.size === correctSet.size && [...selectedSet].every(id => correctSet.has(id));
    }

    if (isCorrect) correctAnswers += 1;
    results.push({
      questionId: question.id,
      answerText,
      selectedOptionIds,
      isCorrect,
    });
  }

  const totalQuestions = quiz.questions.length;
  const scorePercent = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const passed = scorePercent >= Number(quiz.passingScore || 0);

  return {
    totalQuestions,
    correctAnswers,
    scorePercent,
    passed,
    results,
  };
}

