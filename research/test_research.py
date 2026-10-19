"""Small tests for the easy-to-get-wrong research assumptions."""
import math
import unittest

import chess
import numpy as np

from experiment import make_splits, metrics
from features import FEATURES, extract, position_key, solver_board
from fetch_sample import reservoir_add
import random


class FeatureTests(unittest.TestCase):
    def test_lichess_setup_is_opponent_move(self):
        source = "2kr1b1r/p1p2pp1/2pqb3/7p/3N2n1/2NPB3/PPP2PPP/R2Q1RK1 w - - 2 13"
        board = solver_board(source, "d4e6 d6h2")
        self.assertEqual(board.turn, chess.BLACK)
        self.assertIsNone(board.piece_at(chess.D4))
        self.assertEqual(board.piece_at(chess.E6), chess.Piece(chess.KNIGHT, chess.WHITE))
        self.assertEqual(board.piece_at(chess.H2), chess.Piece(chess.PAWN, chess.WHITE))
        board.push_uci("d6h2")
        self.assertTrue(board.is_checkmate())

    def test_rejects_nonmating_published_answer(self):
        with self.assertRaisesRegex(ValueError, "does not mate"):
            solver_board(chess.STARTING_FEN, "e2e4 e7e5")

    def test_score_matches_probability_model_and_does_not_mutate_board(self):
        board = chess.Board("7k/8/5KQ1/8/8/8/8/8 w - - 0 1")
        original = board.fen()
        values, evidence = extract(board)
        self.assertEqual(board.fen(), original)
        self.assertEqual(board.move_stack, [])
        self.assertEqual(evidence["mating_moves"], ["g6g7"])
        self.assertAlmostEqual(values["checking_ratio_score"], math.log(values["checking_moves"] / values["mating_moves"]))
        self.assertGreaterEqual(values["checking_ratio_score"], 0)
        self.assertEqual(set(values), set(FEATURES))
        self.assertTrue(all(math.isfinite(value) for value in values.values()))

    def test_promotions_and_discovered_mates_are_features(self):
        values, evidence = extract(chess.Board("k7/2P5/1K6/8/8/8/8/8 w - - 0 1"))
        self.assertEqual(set(evidence["mating_moves"]), {"c7c8q", "c7c8r"})
        self.assertEqual(values["mating_promotion_available"], 1)
        self.assertEqual(values["mating_underpromotion_available"], 1)
        values, _ = extract(chess.Board("k7/1pK5/8/B7/8/8/8/R7 w - - 0 1"))
        self.assertEqual(values["mating_discovered_check_available"], 1)

    def test_key_ignores_clocks_and_groups_valid_mirrored_equivalents(self):
        board = chess.Board("7k/8/5KQ1/8/8/8/8/8 w - - 0 1")
        self.assertEqual(position_key(board), position_key(board.mirror()))
        same = chess.Board("7k/8/5KQ1/8/8/8/8/8 w - - 9 30")
        self.assertEqual(position_key(board), position_key(same))

    def test_target_and_quality_fields_cannot_enter_feature_matrix(self):
        self.assertTrue(set(FEATURES).isdisjoint({"rating", "rating_deviation", "plays", "puzzle_id", "game_group", "Themes", "NbPlays"}))


class EvaluationTests(unittest.TestCase):
    def test_split_is_disjoint_and_keeps_each_source_game_together(self):
        rows = [{"game_group": f"game-{index // 2}", "position_key": f"position-{index}"} for index in range(100)]
        splits = make_splits(rows)
        self.assertEqual(sum(map(len, splits.values())), len(rows))
        seen = {}
        for name, indices in splits.items():
            for index in indices:
                group = rows[index]["game_group"]
                self.assertIn(seen.get(group, name), [name])
                seen[group] = name
        repeated = make_splits(rows)
        for name in splits:
            np.testing.assert_array_equal(splits[name], repeated[name])

    def test_duplicate_positions_cannot_cross_group_splits(self):
        rows = [{"game_group": f"game-{index}", "position_key": "same-position"} for index in range(30)]
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            make_splits(rows)

    def test_metrics_have_explicit_units_and_constant_rank_is_undefined(self):
        result = metrics(np.array([1000., 1500.]), np.array([1100., 1300.]))
        self.assertEqual(result["mae"], 150.)
        self.assertAlmostEqual(result["spearman"], 1.)
        self.assertIsNone(metrics(np.array([1000., 1500.]), np.array([1200., 1200.]))["spearman"])

    def test_reservoir_is_bounded_and_reproducible(self):
        samples = []
        for _ in range(2):
            sample, rng = [], random.Random(42)
            for index in range(100):
                reservoir_add(sample, {"id": index}, index + 1, 10, rng)
            samples.append(sample)
        self.assertEqual(len(samples[0]), 10)
        self.assertEqual(samples[0], samples[1])


if __name__ == "__main__":
    unittest.main()
