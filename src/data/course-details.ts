export type Lesson = {
  id: string;
  title: string;
  durationMin: number;     // długość w minutach
  isFreePreview?: boolean;
};

export type CourseDetails = {
  id: string;
  title: string;
  author: string;
  category: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  thumbnailUrl?: string;
  lessons: Lesson[];
  stats: { students: number; rating: number; reviews: number };
};

export const COURSE_ANCIENT: CourseDetails = {
  id: 'ancient-civ',
  title: 'Ancient Civilizations',
  author: 'J. Nowak',
  category: 'History',
  level: 'Beginner',
  description:
    'Kurs wprowadzający do najważniejszych cywilizacji starożytnych: Mezopotamii, Egiptu, Grecji i Rzymu. '
    + 'Skupiamy się na strukturach społecznych, osiągnięciach kulturowych oraz kluczowych wydarzeniach.',
  thumbnailUrl: '',
  lessons: [
    { id: 'l1', title: 'Introduction & Sources', durationMin: 12, isFreePreview: true },
    { id: 'l2', title: 'Mesopotamia – City-States', durationMin: 18 },
    { id: 'l3', title: 'Ancient Egypt – Kingdoms & Pharaohs', durationMin: 22 },
    { id: 'l4', title: 'Classical Greece – Polis & Culture', durationMin: 20 },
    { id: 'l5', title: 'The Roman Republic & Empire', durationMin: 24 },
    { id: 'l6', title: 'Legacy & Influence', durationMin: 14 },
  ],
  stats: { students: 1280, rating: 4.7, reviews: 214 },
};
