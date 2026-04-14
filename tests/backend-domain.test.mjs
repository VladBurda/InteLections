import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createYouTubeMaterial,
  extractAcceptedAnswers,
  extractYouTubeVideoConfig,
  normalizeSubscriptionPlan,
  parseYouTubeTimestampToSeconds,
  sanitizeGeneratedQuizDraft,
  sanitizeQuizQuestion,
  scoreQuizAttempt,
  validateLessonQuizDraft,
} from '../backend/domain.mjs';

test('normalizeSubscriptionPlan keeps supported plans and falls back to free', () => {
  assert.equal(normalizeSubscriptionPlan('plus'), 'plus');
  assert.equal(normalizeSubscriptionPlan(' FREE '), 'free');
  assert.equal(normalizeSubscriptionPlan('enterprise'), 'free');
});

test('parseYouTubeTimestampToSeconds supports plain seconds and h/m/s formats', () => {
  assert.equal(parseYouTubeTimestampToSeconds('95'), 95);
  assert.equal(parseYouTubeTimestampToSeconds('1m30s'), 90);
  assert.equal(parseYouTubeTimestampToSeconds('1h2m3s'), 3723);
  assert.equal(parseYouTubeTimestampToSeconds(''), 0);
});

test('extractYouTubeVideoConfig reads video id and timestamp from common youtube urls', () => {
  assert.deepEqual(
    extractYouTubeVideoConfig('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s'),
    { videoId: 'dQw4w9WgXcQ', startSeconds: 90 },
  );
  assert.deepEqual(
    extractYouTubeVideoConfig('https://youtu.be/dQw4w9WgXcQ#t=45'),
    { videoId: 'dQw4w9WgXcQ', startSeconds: 45 },
  );
  assert.equal(extractYouTubeVideoConfig('https://example.com/video'), null);
});

test('createYouTubeMaterial builds embeddable youtube material without storing a file', () => {
  const material = createYouTubeMaterial({
    title: 'Lecture fragment',
    description: 'Starts at the key explanation',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90',
  });

  assert.equal(material.title, 'Lecture fragment');
  assert.equal(material.materialKind, 'youtube');
  assert.equal(material.externalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');
  assert.match(material.filePath, /https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ\?rel=0&start=90/);
  assert.equal(material.fileSizeBytes, 0);
});

test('extractAcceptedAnswers removes blanks, pipes, duplicate values and keeps author variants', () => {
  assert.deepEqual(
    extractAcceptedAnswers(' Cairo | cairo |\nMemphis\n\nCairo '),
    ['Cairo', 'cairo', 'Memphis'],
  );
});

test('sanitizeQuizQuestion normalizes true/false and open-answer questions', () => {
  const trueFalse = sanitizeQuizQuestion({
    prompt: 'The Nile floods yearly.',
    questionType: 'true-false',
    options: [
      { text: 'False', isCorrect: false },
      { text: 'True', isCorrect: true },
    ],
  }, 0);
  assert.equal(trueFalse.questionType, 'true-false');
  assert.deepEqual(trueFalse.options.map(option => ({ text: option.text, isCorrect: option.isCorrect })), [
    { text: 'True', isCorrect: true },
    { text: 'False', isCorrect: false },
  ]);

  const openAnswer = sanitizeQuizQuestion({
    prompt: 'Capital of Egypt',
    questionType: 'open-answer',
    acceptedAnswer: 'Cairo | cairo\nAl-Qahirah',
    options: [{ text: 'Ignored', isCorrect: true }],
  }, 1);
  assert.equal(openAnswer.questionType, 'open-answer');
  assert.deepEqual(openAnswer.options, []);
  assert.equal(openAnswer.acceptedAnswer, 'Cairo\\ncairo\\nAl-Qahirah');
});

test('scoreQuizAttempt evaluates all supported question types and exact multi-select matching', () => {
  const quiz = {
    passingScore: 75,
    questions: [
      {
        id: 'q1',
        questionType: 'single-choice',
        options: [
          { id: 'a', isCorrect: true },
          { id: 'b', isCorrect: false },
        ],
      },
      {
        id: 'q2',
        questionType: 'multi-select',
        options: [
          { id: 'a', isCorrect: true },
          { id: 'b', isCorrect: true },
          { id: 'c', isCorrect: false },
        ],
      },
      {
        id: 'q3',
        questionType: 'true-false',
        options: [
          { id: 'true', isCorrect: true },
          { id: 'false', isCorrect: false },
        ],
      },
      {
        id: 'q4',
        questionType: 'open-answer',
        acceptedAnswer: 'Cairo\nAl-Qahirah',
        options: [],
      },
    ],
  };

  const result = scoreQuizAttempt(quiz, [
    { questionId: 'q1', selectedOptionIds: ['a'] },
    { questionId: 'q2', selectedOptionIds: ['a', 'b', 'c'] },
    { questionId: 'q3', selectedOptionIds: ['true'] },
    { questionId: 'q4', answerText: '  cairo  ' },
  ]);

  assert.equal(result.totalQuestions, 4);
  assert.equal(result.correctAnswers, 3);
  assert.equal(result.scorePercent, 75);
  assert.equal(result.passed, true);
  assert.deepEqual(result.results.map(item => item.isCorrect), [true, false, true, true]);
});

test('scoreQuizAttempt handles empty answers safely', () => {
  const result = scoreQuizAttempt({ passingScore: 50, questions: [] }, []);
  assert.equal(result.totalQuestions, 0);
  assert.equal(result.correctAnswers, 0);
  assert.equal(result.scorePercent, 0);
  assert.equal(result.passed, false);
});

test('sanitizeGeneratedQuizDraft keeps supported types and normalizes generated quiz data', () => {
  const draft = sanitizeGeneratedQuizDraft({
    title: 'Generated Nile quiz',
    description: 'Focus on timeline and key rulers.',
    passingScore: 72.4,
    timeLimitMin: '8',
    maxAttempts: '3',
    questions: [
      {
        prompt: 'Which river shaped ancient Egyptian civilization?',
        questionType: 'single-choice',
        acceptedAnswer: '',
        options: [
          { text: 'Nile', isCorrect: true },
          { text: 'Amazon', isCorrect: false },
        ],
      },
      {
        prompt: 'Name the capital city.',
        questionType: 'open-answer',
        acceptedAnswer: 'Cairo | cairo',
        options: [],
      },
    ],
  });

  assert.equal(draft.passingScore, 72);
  assert.equal(draft.timeLimitMin, 8);
  assert.equal(draft.maxAttempts, 3);
  assert.equal(draft.questions[1].acceptedAnswer, 'Cairo\\ncairo');
});

test('sanitizeGeneratedQuizDraft rejects unsupported generated question types', () => {
  assert.throws(() => sanitizeGeneratedQuizDraft({
    title: 'Broken',
    questions: [
      {
        prompt: 'Explain the source text',
        questionType: 'essay',
        acceptedAnswer: '',
        options: [],
      },
    ],
  }), /unsupported question type/i);
});

test('validateLessonQuizDraft rejects malformed generated quiz structures', () => {
  assert.throws(() => validateLessonQuizDraft({
    title: 'Bad generated quiz',
    description: '',
    passingScore: 60,
    timeLimitMin: null,
    maxAttempts: null,
    questions: [
      {
        id: 'q1',
        prompt: 'Pick all capitals',
        questionType: 'single-choice',
        acceptedAnswer: '',
        sortOrder: 1,
        options: [
          { id: 'a', text: 'Cairo', isCorrect: true, sortOrder: 1 },
          { id: 'b', text: 'Memphis', isCorrect: true, sortOrder: 2 },
        ],
      },
    ],
  }), /exactly one correct answer/i);
});

