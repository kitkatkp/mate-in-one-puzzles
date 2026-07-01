export type Puzzle = {
  id: string;
  fen: string;
  sideToMove: "w" | "b";
  solutions: string[];
};
