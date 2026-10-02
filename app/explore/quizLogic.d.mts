export type QuizQuestion = { text: string; options: string[]; answer: number; explanation: string };
export type PublicQuizQuestion = { text: string; options: string[] };

export declare function toPublicQuestions(questions: QuizQuestion[]): PublicQuizQuestion[];
export declare function isValidAnswerShape(answers: unknown, length: number): answers is number[];
export declare function gradeQuiz(
  questions: Pick<QuizQuestion, "answer">[],
  answers: number[]
): { correct: number; total: number; score: number };
export declare function buildReview(
  questions: Pick<QuizQuestion, "answer" | "explanation">[],
  answers: number[]
): { selected: number; correct: number; isCorrect: boolean; explanation: string }[];
export declare function isValidQuestionIndex(value: unknown, length: number): value is number;
export declare function isValidSingleAnswer(value: unknown): value is number;
export declare function gradeSingle(
  question: Pick<QuizQuestion, "answer" | "explanation">,
  answer: number
): { isCorrect: boolean; explanation?: string };
