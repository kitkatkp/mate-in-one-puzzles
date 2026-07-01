# Mate-in-One Puzzles

A simple open-source TypeScript library for storing and validating verified mate-in-one chess puzzles.

## What this repository is

- A puzzle database in `data/puzzles.json`
- A validation script in `scripts/validate.ts`
- TypeScript types in `src/types.ts`
- Uses `chess.js` to check puzzle legality and mate-in-one solutions

## Puzzle format

Each puzzle includes:

- `id`: unique identifier for the puzzle
- `fen`: the board position in FEN format
- `sideToMove`: `"w"` or `"b"`
- `solutions`: array of correct mate-in-one moves in SAN

Example puzzle:

```json
{
  "id": "sample-01",
  "fen": "8/8/8/8/8/4k3/5Q2/4K3 w - - 0 1",
  "sideToMove": "w",
  "solutions": ["f2-f4"]
}
```

## Validation

Run the validator with:

```bash
npm run validate
```

The script will:

- load all puzzles from `data/puzzles.json`
- validate each FEN string
- find all legal mate-in-one moves
- verify saved solutions are correct
- detect duplicate FENs

If any puzzle fails validation, the script exits with status code `1`.
