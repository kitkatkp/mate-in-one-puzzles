"""Board-only explanatory features. Puzzle ratings never enter these calculations."""
from __future__ import annotations

import math
import chess

FEATURES = [
    "piece_count", "own_piece_count", "defending_piece_count", "legal_moves", "checking_moves",
    "mating_moves", "checking_ratio_score", "nonmating_checks", "one_reply_checks", "mean_check_replies",
    "defending_king_edge_distance", "friendly_blockers_around_king", "initially_attacked_king_neighbors",
    "mating_capture_available", "mating_promotion_available", "mating_underpromotion_available",
    "mating_discovered_check_available", "mating_double_check_available",
    "mating_pawn_available", "mating_knight_available", "mating_bishop_available",
    "mating_rook_available", "mating_queen_available", "mating_king_available",
]


def solver_board(source_fen: str, moves: str) -> chess.Board:
    """The first Lichess move belongs to the opponent, not to the solver."""
    board = chess.Board(source_fen)
    tokens = moves.split()
    if not board.is_valid() or len(tokens) < 2:
        raise ValueError("Invalid source position or missing setup/solution move")
    setup = chess.Move.from_uci(tokens[0])
    if setup not in board.legal_moves:
        raise ValueError("Illegal opponent setup move")
    board.push(setup)
    if not board.is_valid():
        raise ValueError("Invalid solver position")
    answer = chess.Move.from_uci(tokens[1])
    if answer not in board.legal_moves:
        raise ValueError("Illegal published solution")
    board.push(answer)
    mate = board.is_checkmate()
    board.pop()
    if not mate:
        raise ValueError("Published solver move does not mate in one")
    return board


def position_key(board: chess.Board) -> str:
    """Group exact duplicates and rank-mirrored color-swapped equivalents."""
    original = " ".join(board.fen(en_passant="legal").split()[:4])
    mirrored = " ".join(board.mirror().fen(en_passant="legal").split()[:4])
    return min(original, mirrored)


def extract(board: chess.Board) -> tuple[dict[str, float], dict]:
    if not board.is_valid():
        raise ValueError("Features require a valid position")
    side, defender = board.turn, not board.turn
    king = board.king(defender)
    neighbors = list(chess.SquareSet(chess.BB_KING_ATTACKS[king]))
    pieces = board.piece_map()
    values = dict.fromkeys(FEATURES, 0.0)
    values.update({
        "piece_count": len(pieces),
        "own_piece_count": chess.popcount(board.occupied_co[side]),
        "defending_piece_count": chess.popcount(board.occupied_co[defender]),
        "defending_king_edge_distance": min(chess.square_file(king), 7 - chess.square_file(king), chess.square_rank(king), 7 - chess.square_rank(king)),
        "friendly_blockers_around_king": sum(board.color_at(square) == defender for square in neighbors),
        "initially_attacked_king_neighbors": sum(board.is_attacked_by(side, square) for square in neighbors),
    })
    legal = list(board.legal_moves)
    checking, mates, reply_counts = [], [], {}
    nonmate_replies = []
    for move in legal:
        piece = board.piece_type_at(move.from_square)
        capture = board.is_capture(move)
        castle = board.is_castling(move)
        board.push(move)
        try:
            if not board.is_check():
                continue
            checking.append(move.uci())
            replies = board.legal_moves.count()
            reply_counts[move.uci()] = replies
            if replies:
                nonmate_replies.append(replies)
                continue
            mates.append(move.uci())
            values[f"mating_{chess.piece_name(piece)}_available"] = 1.0
            values["mating_capture_available"] = max(values["mating_capture_available"], float(capture))
            values["mating_promotion_available"] = max(values["mating_promotion_available"], float(bool(move.promotion)))
            values["mating_underpromotion_available"] = max(values["mating_underpromotion_available"], float(bool(move.promotion and move.promotion != chess.QUEEN)))
            checkers = list(board.checkers())
            values["mating_double_check_available"] = max(values["mating_double_check_available"], float(len(checkers) > 1))
            moved_squares = {move.to_square}
            if castle:
                moved_squares.add(chess.square(5 if chess.square_file(move.to_square) > chess.square_file(move.from_square) else 3, chess.square_rank(move.to_square)))
            values["mating_discovered_check_available"] = max(values["mating_discovered_check_available"], float(any(square not in moved_squares for square in checkers)))
        finally:
            board.pop()
    if not mates:
        raise ValueError("No mate in one in solver position")
    values.update({
        "legal_moves": len(legal), "checking_moves": len(checking), "mating_moves": len(mates),
        "checking_ratio_score": math.log(len(checking) / len(mates)),
        "nonmating_checks": len(nonmate_replies), "one_reply_checks": sum(count == 1 for count in nonmate_replies),
        "mean_check_replies": sum(nonmate_replies) / len(nonmate_replies) if nonmate_replies else 0,
    })
    evidence = {"fen": board.fen(), "legal_moves": sorted(move.uci() for move in legal), "checking_moves": sorted(checking), "mating_moves": sorted(mates), "check_reply_counts": reply_counts}
    return values, evidence
