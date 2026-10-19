export type Puzzle = {
  id: string;
  fen: string;
  sideToMove: "w" | "b";
  solutions: string[];
};

export type TeachingPuzzle = Puzzle & {
  title: string;
  pairId: string;
  partnerId: string;
  order: number;
  objective: string;
  pattern: string;
  explanation: string;
  primarySolution: string;
  hint: string;
  commonMistake: { move: string; reply: string };
  difficulty: {
    band: "Foundation" | "Developing" | "Stretch";
    reason: string;
    demands: string[];
  };
  comparison: { from: string; to: string; question: string; answer: string };
  understanding: { question: string; choices: string[]; correctIndex: number; explanation: string };
};
