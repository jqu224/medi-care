// 学习中心内容契约。
// 类型统一在这里定义；数据由 learningCards.ts（知识卡片）和
// learningQuiz.ts（问答套题 + 术语猜词）提供，本文件负责汇总导出。
export type LearningSection = "知识卡片" | "问答练习" | "术语猜词";
export const sections: LearningSection[] = ["知识卡片", "问答练习", "术语猜词"];

export type Source = { name: string; url: string } | null;
export type Card = {
  id: string;
  topic: string;
  title: string;
  text: string;
  takeaway: string;
  source: Source;
};
export type Question = {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  source: Source;
};
export type QuizSet = {
  id: string;
  title: string;
  description: string;
  questions: Question[];
};
export type Word = { word: string; meaning: string; hint: string };

export { topics, cards } from "./learningCards";
export { quizSets, words } from "./learningQuiz";
