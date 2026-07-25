export type AspectKey =
  | 'academics'
  | 'teachers'
  | 'infrastructure'
  | 'safety'
  | 'transport'
  | 'value'
  | 'happiness';

export interface AspectDefinition {
  key: AspectKey;
  label: string;
  emoji: string;
  prompt: string;
  description: string;
}

export const SCHOOL_ASPECTS: AspectDefinition[] = [
  {
    key: 'academics',
    label: 'Academics',
    emoji: '📚',
    prompt: 'How is the teaching quality, syllabus & homework load?',
    description: 'Curriculum delivery, exams, and conceptual clarity.',
  },
  {
    key: 'teachers',
    label: 'Teachers',
    emoji: '👩‍🏫',
    prompt: 'Are teachers attentive, approachable & encouraging?',
    description: 'Teacher empathy, communication, and responsiveness.',
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    emoji: '🏗️',
    prompt: 'How are the classrooms, labs, sports & campus facilities?',
    description: 'Building upkeep, playground, technology, and sanitation.',
  },
  {
    key: 'safety',
    label: 'Safety & Hygiene',
    emoji: '🛡️',
    prompt: 'Is the campus secure and washrooms/canteen clean?',
    description: 'Security guards, CCTV, washroom hygiene, and child safety.',
  },
  {
    key: 'transport',
    label: 'Transport',
    emoji: '🚌',
    prompt: 'How reliable, punctual & safe is the school bus service?',
    description: 'Bus condition, driver care, tracking app, and route coverage.',
  },
  {
    key: 'value',
    label: 'Value for Money',
    emoji: '💰',
    prompt: 'Are the fees justified relative to facilities & experience?',
    description: 'Fee transparency, hidden costs, and fee hike frequency.',
  },
  {
    key: 'happiness',
    label: 'Child Happiness',
    emoji: '😊',
    prompt: 'Does your child look forward to school each day?',
    description: 'Peer environment, stress level, activities, and overall vibe.',
  },
];

export interface EmojiOption {
  score: number;
  emoji: string;
  label: string;
}

export const EMOJI_SCALE: EmojiOption[] = [
  { score: 1, emoji: '😟', label: 'Poor' },
  { score: 2, emoji: '😕', label: 'Fair' },
  { score: 3, emoji: '😐', label: 'Average' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '🤩', label: 'Excellent' },
];

export const GRADE_OPTIONS = [
  'Playgroup / Nursery',
  'LKG / UKG',
  'Primary (Grades 1-5)',
  'Middle School (Grades 6-8)',
  'High School (Grades 9-10)',
  'Senior Secondary (Grades 11-12)',
];

export function getEmojiForScore(score: number): string {
  const rounded = Math.round(score);
  const found = EMOJI_SCALE.find((e) => e.score === rounded);
  return found ? found.emoji : '😐';
}
