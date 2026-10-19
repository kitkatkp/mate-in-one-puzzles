import { Chess, type Square } from "chess.js";
import { lessons } from "../data/lessons";
import { analyzeAttempt, pieceName, type AttemptAnalysis, type MoveInput } from "../src/analysis";
import { emptyLog, parseStudyLog, STORAGE_KEY, studyStats, type StudyEvent } from "../src/progress";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
const escape = (text: unknown): string => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const glyphs = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
let storageMessage = "";
let canPersist = true;
let log = emptyLog();
try { log = parseStudyLog(localStorage.getItem(STORAGE_KEY)); }
catch { canPersist = false; storageMessage = "Saved study data could not be read and has been left untouched. This session still works; export your new results before closing, or clear the old results from the notebook."; }
let learner = "Learner 1";
try { learner = localStorage.getItem('mate-lab-learner')?.slice(0, 40) || learner; } catch { /* Results still work in memory. */ }
let index = Math.max(0, lessons.findIndex((puzzle) => puzzle.id === location.hash.slice(1)));
let analysis: AttemptAnalysis | null = null;
let selected: Square | null = null;
let focusSquare: Square = "a1";
let hintShown = false, revealed = false, assisted = false, replyShown = false, compareShown = false;
let flipped = lessons[index].sideToMove === "b";
let view: "lesson" | "notebook" = "lesson";
let understandingChoice: number | null = null;
let pendingPromotion: { from: Square; to: Square } | null = null;
let inspection: { square: Square; attackers: Square[] } | null = null;
let visitId = "", started = 0, seenBefore = false;
let note = "";
let clockStarted = false;

function record(type: StudyEvent["type"], extra: Partial<StudyEvent> = {}) {
  log.events.push({ type, learner, visitId, puzzleId: lessons[index].id, at: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started), ...extra });
  try { if (canPersist) localStorage.setItem(STORAGE_KEY, JSON.stringify(log)); }
  catch { storageMessage = "Browser storage is unavailable or full. Results are kept in this tab; export them before closing."; }
}
function beginVisit() {
  started = performance.now();
  visitId = crypto.randomUUID();
  seenBefore = log.events.some((event) => event.learner === learner && event.puzzleId === lessons[index].id && event.type === "visit");
  record("visit", { seenBefore });
  clockStarted = true;
}
function loadPuzzle(next: number) {
  index = (next + lessons.length) % lessons.length;
  analysis = null; selected = null; hintShown = false; revealed = false; assisted = false;
  replyShown = false; compareShown = false; understandingChoice = null; pendingPromotion = null; inspection = null; note = "";
  flipped = lessons[index].sideToMove === "b";
  focusSquare = flipped ? "h8" : "a1";
  history.replaceState(null, "", `#${lessons[index].id}`);
  beginVisit(); render();
}
function displayFen(): string {
  if (compareShown) return lessons.find((puzzle) => puzzle.id === lessons[index].partnerId)!.fen;
  return replyShown && analysis?.reply ? analysis.reply.fen : analysis?.afterFen ?? lessons[index].fen;
}
function attempt(input: MoveInput) {
  if (!clockStarted) beginVisit();
  analysis = analyzeAttempt(lessons[index].fen, input);
  const move = typeof input === "string" ? input : `${input.from}${input.to}${input.promotion ?? ""}`;
  record("move", { move, outcome: analysis.status, assisted });
  selected = null; pendingPromotion = null; replyShown = false; inspection = null; note = "";
  render();
  app.querySelector<HTMLElement>('.feedback')?.focus({ preventScroll: true });
  if (matchMedia('(max-width: 700px)').matches) app.querySelector('.feedback')?.scrollIntoView({ block: 'start' });
}
function showSolution(san = lessons[index].primarySolution) {
  if (!revealed) record("reveal");
  assisted = true; revealed = true; compareShown = false; selected = null; pendingPromotion = null; replyShown = false; inspection = null;
  analysis = analyzeAttempt(lessons[index].fen, san);
  render();
}

function boardHTML(): string {
  const chess = new Chess(displayFen());
  const files = flipped ? "hgfedcba" : "abcdefgh";
  const ranks = flipped ? "12345678" : "87654321";
  const movable = !compareShown && !pendingPromotion && (!analysis || analysis.status === "illegal");
  const legalTargets = selected && movable ? chess.moves({ square: selected, verbose: true }).map((move) => move.to) : [];
  const last = compareShown ? undefined : replyShown ? analysis?.reply : analysis?.move;
  const checkers = !compareShown && !replyShown && analysis?.proof?.checkers || [];
  let html = "";
  for (const [row, rank] of [...ranks].entries()) {
    html += '<div role="row" class="board-row">';
    for (const [column, file] of [...files].entries()) {
      const square = `${file}${rank}` as Square;
      const piece = chess.get(square);
      const dark = (file.charCodeAt(0) - 97 + Number(rank)) % 2 === 1;
      const classes = ["square", dark ? "dark" : "light", selected === square ? "selected" : "", last && (last.from === square || last.to === square) ? "last-move" : "", inspection?.square === square ? "inspected" : "", inspection?.attackers.includes(square) ? "protector" : "", checkers.includes(square) ? "checker" : ""].filter(Boolean).join(" ");
      html += `<div role="gridcell"><button class="${classes}" data-square="${square}" aria-label="${square}, ${piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${pieceName(piece.type)}` : 'empty'}" aria-pressed="${selected === square}" tabindex="${square === focusSquare ? 0 : -1}">
        ${column === 0 ? `<span class="rank-label" aria-hidden="true">${rank}</span>` : ""}
        ${piece ? `<span aria-hidden="true" class="piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}">${glyphs[piece.type]}</span>` : ""}
        ${legalTargets.includes(square) ? '<span class="move-dot" aria-hidden="true"></span>' : ''}
        ${row === 7 ? `<span class="file-label" aria-hidden="true">${file}</span>` : ""}
      </button></div>`;
    }
    html += '</div>';
  }
  return `<div class="board-wrap"><div class="board" role="grid" aria-label="Chessboard. Select a piece, then a destination. Use arrow keys to move between squares." aria-rowcount="8" aria-colcount="8">${html}</div></div>`;
}

function feedbackHTML(): string {
  if (compareShown) return `<div class="turn-card" role="status"><span class="small-label">REFERENCE POSITION</span><h3>Compare the changed piece.</h3><p>The board shows the first position in this pair. Return to your position to see its move feedback and explanation.</p></div>`;
  if (!analysis) return `<div class="turn-card"><span class="small-label">YOUR CHALLENGE</span><h3>Find checkmate in one.</h3><p>Look at every escape square. Any legal mating move counts.</p></div>`;
  const titles = { illegal: "That move isn't legal", mate: revealed ? "Let's walk through it" : "You found the mate.", check: "Check, but not checkmate.", stalemate: "No moves. But no check.", "not-check": "The king isn't in check." };
  return `<div class="feedback ${analysis.status === 'mate' ? 'success' : 'try-again'}" role="status" tabindex="-1"><span class="small-label">${analysis.status === 'mate' ? (revealed ? 'SOLUTION VIEW' : 'CHECKMATE') : 'KEEP LOOKING'}</span><h3>${titles[analysis.status]}</h3><p>${escape(analysis.message)}</p>
    ${analysis.status !== 'mate' ? `<div class="button-row">${analysis.reply ? `<button class="button small" data-action="reply">${replyShown ? 'Back to your move' : `Play ${escape(analysis.reply.san)}`}</button>` : ''}<button class="button primary small" data-action="retry">Try again</button></div>` : ''}
    ${replyShown ? '<p class="fine-print">One legal defence, shown to demonstrate why this is not mate in one.</p>' : ''}
  </div>`;
}

function explanationHTML(): string {
  if (compareShown || analysis?.status !== "mate" || !analysis.proof) return "";
  const puzzle = lessons[index], proof = analysis.proof, chess = new Chess(analysis.afterFen);
  const question = puzzle.understanding;
  const mistake = analyzeAttempt(puzzle.fen, puzzle.commonMistake.move);
  return `<section class="explanation" aria-label="Mate explanation">
    <div class="section-heading"><span class="small-label">UNDERSTAND THE WHY</span><span class="verified">✓ Board-verified facts</span></div>
    ${analysis.move?.san === puzzle.primarySolution ? `<p class="authored">${escape(puzzle.explanation)}</p>` : `<p class="authored">Another valid solution. ${escape(puzzle.objective)} The proof below explains this particular move.</p>`}
    <details open><summary><span class="step-number">1</span> Where is the check?</summary><p>The ${proof.checkers.map((square) => `${pieceName(chess.get(square)!.type)} on ${square}`).join(' and ')} ${proof.checkers.length > 1 ? 'check' : 'checks'} the king on ${proof.king}.</p><div class="tags">${analysis.tags.map((tag) => `<span>${escape(tag)}</span>`).join('')}</div></details>
    <details open><summary><span class="step-number">2</span> Why can't the king escape?</summary><p class="fine-print">Select a square below to highlight it and its attackers.</p><ul class="square-facts">${proof.escapes.map((fact) => `<li><button data-inspect="${fact.square}" class="fact ${inspection?.square === fact.square ? 'active' : ''}"><strong>${fact.square}</strong><span>${escape(fact.reason.replace(`${fact.square} `, ''))}</span></button></li>`).join('')}</ul></details>
    <details><summary><span class="step-number">3</span> Why can't the checker be captured?</summary>${proof.capture.map((text) => `<p>${escape(text)}</p>`).join('')}</details>
    <details><summary><span class="step-number">4</span> Why can't the check be blocked?</summary>${proof.blocking.map((text) => `<p>${escape(text)}</p>`).join('')}</details>
    <details><summary>A tempting alternative: ${escape(puzzle.commonMistake.move)}</summary><p>${escape(mistake.message)}</p><p>The verified reply is <strong>${escape(mistake.reply?.san)}</strong>. ${escape(mistake.reply?.explanation)}</p></details>
    <label class="solution-picker">Explore every correct move<select id="solutions" aria-label="Explore every correct move">${puzzle.solutions.map((solution) => `<option ${analysis?.move?.san === solution ? 'selected' : ''}>${escape(solution)}</option>`).join('')}</select></label>
    ${puzzle.order % 2 === 0 ? `<div class="pair-answer"><span class="small-label">WHAT CHANGED?</span><p>${escape(puzzle.comparison.answer)}</p></div>` : ''}
    <section class="understanding"><span class="small-label">ONE MORE THOUGHT</span><h3>${escape(question.question)}</h3><p class="fine-print">Consider the move named in the question from the starting position. It may be a different example from the board currently displayed.</p><div class="answer-choices">${question.choices.map((choice, choiceIndex) => `<button data-answer="${choiceIndex}" ${understandingChoice !== null ? 'disabled' : ''} class="answer ${understandingChoice !== null && choiceIndex === question.correctIndex ? 'correct' : understandingChoice === choiceIndex ? 'incorrect' : ''}"><span>${String.fromCharCode(65 + choiceIndex)}</span>${escape(choice)}</button>`).join('')}</div>${understandingChoice !== null ? `<p class="answer-result" role="status">${understandingChoice === question.correctIndex ? 'Exactly. ' : 'Look again. '}${escape(question.explanation)}</p>` : ''}</section>
    <button class="button primary full" data-action="continue">${puzzle.order === lessons.length ? 'Review your notebook' : puzzle.order % 2 === 1 ? 'Try the changed position →' : 'Next idea →'}</button>
  </section>`;
}

function sidebarHTML(): string {
  const pairs = lessons.filter((puzzle) => puzzle.order % 2 === 1);
  return `<aside class="curriculum" aria-label="Lesson navigation"><span class="small-label">FIVE IDEAS TO SEE</span><nav>${pairs.map((pair, pairIndex) => {
    const active = lessons[index].pairId === pair.pairId;
    return `<div class="lesson-group ${active ? 'active' : ''}"><button class="lesson-name" data-index="${pairIndex * 2}" aria-current="${active ? 'step' : 'false'}"><span class="lesson-number">0${pairIndex + 1}</span><span>${escape(pair.pattern)}</span></button>${active ? `<div class="pair-links">${[pairIndex * 2, pairIndex * 2 + 1].map((i) => {
      const solved = log.events.some((event) => event.learner === learner && event.puzzleId === lessons[i].id && event.type === 'move' && event.outcome === 'mate');
      return `<button data-index="${i}" class="pair-link ${index === i ? 'current' : ''}" ${index === i ? 'aria-current="page"' : ''}><span class="progress-dot ${solved ? 'solved' : ''}">${solved ? '✓' : ''}</span>${i % 2 === 0 ? 'First look' : 'One small change'}</button>`;
    }).join('')}</div>` : ''}</div>`;
  }).join('')}</nav><div class="sidebar-note"><span class="note-mark">↗</span><p>Small positions.<br>Big differences.</p><span>Look for the idea,<br>not just the move.</span></div></aside>`;
}

function notebookHTML(): string {
  const stats = studyStats(log.events, learner);
  const rate = stats.firstTryRate === null ? '—' : `${Math.round(stats.firstTryRate * 100)}%`;
  return `<main class="notebook"><button class="text-button" data-action="close-notebook">← Back to your board</button><span class="small-label">YOUR LEARNING NOTEBOOK</span><h1>Understanding comes first.</h1><p class="lede">A record of your attempts, hints, and explanations. Difficulty labels are provisional teaching judgments, not Elo ratings.</p>
    <form id="learner-form" class="learner-form"><label for="learner">Learner label <span>(use a nickname, not personal details)</span></label><div class="button-row"><input id="learner" value="${escape(learner)}" maxlength="40" required autocomplete="off" /><button class="button primary" type="submit">Switch learner</button></div></form>
    <div class="stats-grid"><div><strong>${stats.solved}<small>/10</small></strong><span>Positions solved</span></div><div><strong>${rate}</strong><span>Fresh first-try accuracy</span><small>${stats.firstTryCorrect} / ${stats.freshAttempts} unassisted first tries</small></div><div><strong>${stats.meanSuccessSeconds === null ? '—' : `${Math.round(stats.meanSuccessSeconds)}s`}</strong><span>Time on correct first tries</span></div><div><strong>${stats.understandingCorrect}<small>/${stats.understandingAnswered}</small></strong><span>Understanding questions</span></div></div>
    <section class="concept-stats"><h2>Look at the ideas individually.</h2><p>These samples are small. Use mistakes to choose what to revisit, rather than treating this as a player rating.</p><table><thead><tr><th scope="col">Idea</th><th scope="col">Fresh first tries</th><th scope="col">Understanding</th><th scope="col">Practice</th></tr></thead><tbody>${lessons.filter((puzzle) => puzzle.order % 2 === 1).map((puzzle) => {
      const concept = studyStats(log.events, learner, lessons.filter((candidate) => candidate.pairId === puzzle.pairId).map((candidate) => candidate.id));
      return `<tr><th scope="row">${escape(puzzle.pattern)}</th><td>${concept.firstTryCorrect} / ${concept.freshAttempts}</td><td>${concept.understandingCorrect} / ${concept.understandingAnswered}</td><td><button class="text-button" data-index="${puzzle.order - 1}">Revisit →</button></td></tr>`;
    }).join('')}</tbody></table></section>
    <section class="study-notes"><h2>A few useful distinctions.</h2><p>Fresh first tries exclude previously opened positions and moves made after a hint or solution view. Illegal attempted moves count as attempts. Time measures the wall-clock interval from opening a position to submitting a move; it is not a speed rating.</p><p>All ten positions are taught with their theme visible. Partner positions are learning exercises, not blind tests of transfer. An actual learner study still needs people to try the app.</p><p>${stats.hints} hint views · ${stats.reveals} solution views for ${escape(learner)}. Understanding results use the first answer per visit and are reported separately from move accuracy.</p><p>Results stay in this browser. Export includes all learner labels and events on this device. It does not include account information, IP addresses, or anything sent to a server.</p><div class="button-row"><button class="button primary" data-action="export">Export study results</button><button class="button danger" data-action="clear">Clear this browser's results</button></div></section>
  </main>`;
}

function render() {
  const puzzle = lessons[index], stats = studyStats(log.events, learner);
  const complete = analysis?.status === 'mate';
  app.innerHTML = `<header class="site-header"><a class="brand" href="#${puzzle.id}" data-action="home"><span class="brand-icon" aria-hidden="true">♞</span><span>mate<span class="brand-light">lab</span><small>CHESS, UNDERSTOOD.</small></span></a><span class="header-note">A small change. A deeper understanding.</span><button class="notebook-link" data-action="notebook"><span aria-hidden="true">▤</span> Your notebook <span class="count">${stats.solved}/10</span></button></header>
    ${storageMessage ? `<div class="storage-warning" role="status">${escape(storageMessage)}</div>` : ''}
    ${view === 'notebook' ? notebookHTML() : `<div class="page-intro"><div><span class="eyebrow">THE MATE-IN-ONE WORKSHOP</span><h1>Find the mate. <em>Understand the why.</em></h1></div><p>Ten positions. Five small changes.<br>A better way to see the whole board.</p></div>
    <main class="workspace">${sidebarHTML()}<section class="play-area" aria-label="Current puzzle"><div class="puzzle-heading"><div><span class="small-label">POSITION ${String(puzzle.order).padStart(2, '0')} / 10</span><h2>${escape(puzzle.title)}</h2></div><span class="difficulty">${puzzle.difficulty.band}</span></div>
      <div class="board-status"><span class="turn"><i class="${new Chess(displayFen()).turn() === 'w' ? 'white-turn' : 'black-turn'}"></i>${compareShown ? 'Reference position' : replyShown ? 'Defensive reply' : complete ? 'Mating position' : analysis && analysis.status !== 'illegal' ? `${puzzle.sideToMove === 'w' ? 'Black' : 'White'} to respond` : `${puzzle.sideToMove === 'w' ? 'White' : 'Black'} to move`}</span><button class="text-button" data-action="flip">↻ Flip board</button></div>
      ${boardHTML()}
      <div class="board-caption"><span>${selected ? `${selected} selected · choose a destination` : inspection ? `Inspecting ${inspection.square} · highlighted pieces control it` : compareShown ? 'Compare the changed piece. Return to play.' : complete ? 'Explore the escape squares in the explanation.' : analysis && analysis.status !== 'illegal' ? 'Explore the reply, then choose Try again.' : 'Select a piece, then its destination.'}</span><span>${flipped ? 'Black' : 'White'} perspective</span></div>
      ${compareShown ? '<button class="button primary full" data-action="compare">Return to your position</button>' : !analysis || analysis.status === 'illegal' ? `<form id="move-form" class="move-form"><label for="move-input">Or enter a move</label><input id="move-input" placeholder="e.g. Qg7" autocomplete="off" spellcheck="false" required aria-label="Move in chess notation" /><button type="submit" class="button">Try move →</button></form>` : ''}
      <div class="board-controls"><button class="text-button" data-action="reset">↺ Restart position</button><span>${escape(learner)} · ${seenBefore ? 'Revisited position' : 'First look'}</span><button class="text-button" data-action="skip">${index === lessons.length - 1 ? 'Notebook →' : 'Next →'}</button></div>
      <details class="keyboard-help"><summary>Keyboard controls</summary><p>Tab to the board, use arrow keys to choose a square, and Enter or Space to select it. Escape cancels a selection. You can also type a move in chess notation, including a promotion such as c8=R.</p></details>
    </section><aside class="teaching-panel" aria-label="Feedback and explanation"><div class="lesson-intro"><span class="small-label">THE IDEA</span><h2>${escape(puzzle.pattern)}</h2><p>${escape(puzzle.objective)}</p></div>
      ${puzzle.order % 2 === 0 ? `<div class="change-card"><span class="change-icon" aria-hidden="true">⇄</span><div><strong>One small change</strong><p>${puzzle.comparison.from} → ${puzzle.comparison.to}. ${escape(puzzle.comparison.question)}</p><button class="text-button" data-action="compare">${compareShown ? 'Return to your position' : 'Compare with the first position'}</button></div></div>` : ''}
      ${pendingPromotion ? `<section class="promotion" role="group" aria-label="Choose promotion"><h3>Choose your promotion</h3><p>A pawn reaching the last rank becomes a queen, rook, bishop, or knight.</p><div class="button-row">${['q', 'r', 'b', 'n'].map((piece) => `<button class="button" data-promotion="${piece}">${pieceName(piece as 'q' | 'r' | 'b' | 'n')}</button>`).join('')}<button class="text-button" data-action="cancel-promotion">Cancel</button></div></section>` : ''}
      ${note ? `<p class="notice" role="status">${escape(note)}</p>` : ''}
      ${feedbackHTML()}
      ${!complete && !compareShown ? `<div class="help-actions"><button class="button subtle" data-action="hint" ${hintShown ? 'disabled' : ''}>A little hint</button><button class="text-button" data-action="solution">Show & explain</button></div>${hintShown ? `<div class="hint" role="status"><strong>Look a little closer.</strong><p>${escape(puzzle.hint)}</p><span class="fine-print">This attempt is marked as assisted.</span></div>` : ''}` : ''}
      ${explanationHTML()}
      <details class="difficulty-details"><summary>About this difficulty</summary><p><strong>${puzzle.difficulty.band} · provisional.</strong> ${escape(puzzle.difficulty.reason)}</p><div class="tags">${puzzle.difficulty.demands.map((demand) => `<span>${escape(demand)}</span>`).join('')}</div><p class="fine-print">An instructional profile, not a measured Elo rating. Real solve data will be needed to calibrate difficulty.</p></details>
    </aside></main>`}
    <footer><span>Small puzzles. Lasting understanding.</span><a href="/research/">Explore the difficulty study →</a><span>Original teaching positions · Verified with chess.js · Results stay on your device</span></footer>`;
}

function selectSquare(square: Square) {
  if (compareShown || pendingPromotion || (analysis && analysis.status !== "illegal")) return;
  focusSquare = square;
  const chess = new Chess(lessons[index].fen), piece = chess.get(square);
  if (piece?.color === chess.turn()) {
    selected = selected === square ? null : square;
    note = ""; render();
    app.querySelector<HTMLButtonElement>(`[data-square="${square}"]`)?.focus();
    return;
  }
  if (!selected) { note = `Choose a ${chess.turn() === 'w' ? 'white' : 'black'} piece first.`; render(); return; }
  const moving = chess.get(selected)!;
  if (moving.type === 'p' && (square[1] === '8' || square[1] === '1') && chess.moves({ square: selected, verbose: true }).some((move) => move.to === square)) {
    pendingPromotion = { from: selected, to: square }; render();
    app.querySelector<HTMLButtonElement>('[data-promotion]')?.focus();
  } else attempt({ from: selected, to: square });
}

app.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("button, a");
  if (!target) return;
  if (target.dataset.square) { selectSquare(target.dataset.square as Square); return; }
  if (target.dataset.index !== undefined) { view = 'lesson'; loadPuzzle(Number(target.dataset.index)); return; }
  if (target.dataset.answer !== undefined && understandingChoice === null && analysis?.status === 'mate') {
    understandingChoice = Number(target.dataset.answer);
    record('understanding', { correct: understandingChoice === lessons[index].understanding.correctIndex, choice: understandingChoice }); render(); return;
  }
  if (target.dataset.inspect && analysis?.proof) {
    const fact = analysis.proof.escapes.find((candidate) => candidate.square === target.dataset.inspect)!;
    inspection = { square: fact.square, attackers: fact.attackers }; replyShown = false; compareShown = false; render();
    app.querySelector('.board-wrap')?.scrollIntoView({ block: 'center' }); return;
  }
  if (target.dataset.promotion && pendingPromotion) { attempt({ ...pendingPromotion, promotion: target.dataset.promotion }); return; }
  const action = target.dataset.action;
  if (!action) return;
  event.preventDefault();
  if (action === 'notebook') { view = 'notebook'; render(); window.scrollTo(0, 0); }
  if (action === 'close-notebook' || action === 'home') { view = 'lesson'; render(); }
  if (action === 'flip') { flipped = !flipped; render(); }
  if (action === 'hint' && !hintShown) { assisted = true; hintShown = true; record('hint'); render(); }
  if (action === 'solution') showSolution();
  if (action === 'reply') { replyShown = !replyShown; compareShown = false; render(); }
  if (action === 'retry') { analysis = null; replyShown = false; compareShown = false; selected = null; note = ''; render(); }
  if (action === 'compare') { compareShown = !compareShown; selected = null; inspection = null; render(); }
  if (action === 'cancel-promotion') { pendingPromotion = null; render(); }
  if (action === 'reset') loadPuzzle(index);
  if (action === 'continue' || action === 'skip') {
    if (index === lessons.length - 1) { view = 'notebook'; render(); window.scrollTo(0, 0); }
    else { loadPuzzle(index + 1); app.querySelector('main')?.scrollIntoView({ block: 'start' }); }
  }
  if (action === 'export') {
    const blob = new Blob([JSON.stringify({ ...log, exportedAt: new Date().toISOString(), curriculum: 'mate-lab-v1', notes: 'Theme-visible instruction. Fresh attempts exclude previously opened positions and assistance. Timing is elapsed wall-clock time.' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'mate-lab-study.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (action === 'clear' && confirm("Clear results for every learner label in this browser? Export first if you want to keep them.")) {
    log = emptyLog(); storageMessage = ''; canPersist = true; loadPuzzle(index); view = 'notebook'; render();
  }
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (form.id === 'move-form') {
    const input = app.querySelector<HTMLInputElement>('#move-input')!.value.trim();
    if (input) attempt(input);
  }
  if (form.id === 'learner-form') {
    const value = app.querySelector<HTMLInputElement>('#learner')!.value.trim();
    if (!value) return;
    learner = value;
    try { localStorage.setItem('mate-lab-learner', learner); } catch { /* Keep the label in memory. */ }
    view = 'lesson'; loadPuzzle(index);
  }
});
app.addEventListener('change', (event) => {
  if ((event.target as HTMLElement).id === 'solutions') showSolution((event.target as HTMLSelectElement).value);
});
app.addEventListener('keydown', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-square]');
  if (!button) return;
  if (event.key === 'Escape') { selected = null; pendingPromotion = null; render(); app.querySelector<HTMLButtonElement>(`[data-square="${focusSquare}"]`)?.focus(); return; }
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
  if (!step) return;
  event.preventDefault();
  const square = button.dataset.square!;
  const direction = flipped ? -1 : 1;
  const file = square.charCodeAt(0) - 97 + step[0] * direction, rank = Number(square[1]) + step[1] * direction;
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return;
  focusSquare = `${'abcdefgh'[file]}${rank}` as Square;
  app.querySelectorAll<HTMLButtonElement>('[data-square]').forEach((element) => { element.tabIndex = element.dataset.square === focusSquare ? 0 : -1; });
  app.querySelector<HTMLButtonElement>(`[data-square="${focusSquare}"]`)?.focus();
});
window.addEventListener('hashchange', () => {
  const next = lessons.findIndex((puzzle) => puzzle.id === location.hash.slice(1));
  if (next >= 0) { view = 'lesson'; loadPuzzle(next); }
});
loadPuzzle(index);
