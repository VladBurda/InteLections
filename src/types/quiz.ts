export type QuizOption = {
  id: string;
  text: string;
  isCorrect: boolean;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  questionType: 'single-choice' | 'multi-select' | 'true-false' | 'open-answer';
  acceptedAnswer?: string;
  options: QuizOption[];
};

export type LessonQuiz = {
  id: string;
  title: string;
  description: string;
  passingScore: number;
  timeLimitMin: number | null;
  maxAttempts: number | null;
  accessScope?: 'course' | 'group';
  accessGroupId?: string | null;
  accessGroupName?: string | null;
  availableFrom?: string | null;
  availableTo?: string | null;
  availabilityStatus?: 'open' | 'scheduled' | 'closed' | 'group-only';
  canAttempt?: boolean;
  attemptsUsed?: number;
  questions: QuizQuestion[];
};

export type QuizAttemptSummary = {
  id: string;
  scorePercent: number;
  passed: boolean;
  totalQuestions: number;
  correctAnswers: number;
  submittedAt?: string;
};

export type GenerateLessonQuizDraftInput = {
  questionCount?: number;
  difficulty?: 'easy' | 'mixed' | 'challenging';
  preferredQuestionTypes?: Array<'single-choice' | 'multi-select' | 'true-false' | 'open-answer'>;
  teacherInstruction?: string;
};

export type GeneratedLessonQuizDraft = {
  title: string;
  description?: string;
  passingScore: number;
  timeLimitMin?: number | null;
  maxAttempts?: number | null;
  questions: Array<{
    prompt: string;
    questionType: 'single-choice' | 'multi-select' | 'true-false' | 'open-answer';
    acceptedAnswer?: string;
    options: Array<{ text: string; isCorrect: boolean }>;
  }>;
};

export type CreateLessonQuizInput = {
  title: string;
  description?: string;
  passingScore: number;
  timeLimitMin?: number | null;
  maxAttempts?: number | null;
  accessScope?: 'course' | 'group';
  accessGroupId?: string | null;
  availableFrom?: string | null;
  availableTo?: string | null;
  questions: Array<{
    prompt: string;
    questionType: 'single-choice' | 'multi-select' | 'true-false' | 'open-answer';
    acceptedAnswer?: string;
    options: Array<{ text: string; isCorrect: boolean }>;
  }>;
};

export type SubmitQuizAttemptInput = {
  answers: Array<{
    questionId: string;
    answerText?: string;
    selectedOptionIds?: string[];
  }>;
};
