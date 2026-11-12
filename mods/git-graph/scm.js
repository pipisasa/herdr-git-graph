// Changes: VS Code's Source Control Changes view as a panel docked on the right of the graph.
// A message box and Commit, then Staged Changes and Changes with stage / unstage / discard
// per file and per section. A file opens its diff (staged or working tree) at the bottom.
// The lists come from the status the graph already reads (view.data.scm), so they refresh with it.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { openOverlay, shared } from "herdr";
import { runSteps, scmDiff } from "./git.js";
import { DiffText } from "./code.js";
import { sparkClick, openConfigMenu, agentOf, AGENTS, modelOf, MODELS } from "./ai.js";

const ICON = (n) => `mods/git-graph/${n}.svg`;
export const SCM_W = 300;
const color = (t, s) => (s === "A" || s === "U" ? t.ansi2 : s === "D" || s === "!" ? t.ansi1 : s === "R" ? t.ansi4 : t.blocked);

export function initScm(gg, helpers) {
  gg.scmH = helpers;
  gg.scm = { open: false, message: "", busy: false, note: null, typing: false, hide: {}, file: null, diff: null };
  gg.aiSeen = shared("git-graph.ai-run")?.at ?? null;
  // Multi-line like VS Code's: Enter is a new line, Cmd/Ctrl-Enter commits; grows to 8 rows.
  const s = (gg.scmInput = TextareaState.new({ placeholder: "Message (⌘Enter to commit)", rows: 1 }));
  s.set_auto_grow(1, 8);
  s.on("change", (_e, cx) => { const had = Boolean(gg.scm.message.trim()); gg.scm.message = s.value(); if (had !== Boolean(gg.scm.message.trim())) cx.notify(); });
  s.on("submit", (e, cx) => { if (e.secondary) commit(gg, cx); });
  s.on("focus", (_e, cx) => { gg.typing = true; gg.scm.typing = true; cx.notify(); });
  s.on("blur", (_e, cx) => { gg.typing = false; gg.scm.typing = false; cx.notify(); });
}

const lists = (gg) => gg.view?.data.scm ?? { staged: [], unstaged: [] };
const pathsOf = (files) => files.flatMap((f) => (f.old ? [f.old, f.path] : [f.path]));

export function toggleScm(gg, cx) {
  gg.scm.open = !gg.scm.open;
  if (gg.scm.open) gg.scmInput.focus();
  else closeFile(gg);
  cx.notify();
}

export function closeFile(gg) { gg.scm.file = null; clearDiff(gg); }
function clearDiff(gg) { gg.scm.diff = null; }

// After a refresh: keep the open diff if its file is still on the same side, else close it.
export function syncScm(gg, cx) {
  const f = gg.scm.file;
  if (!f) return;
  const now = (f.staged ? lists(gg).staged : lists(gg).unstaged).find((x) => x.path === f.path);
  if (!now) { closeFile(gg); return; }
  gg.scm.file = { ...now, staged: f.staged };
  loadDiff(gg, cx);
}

function pick(gg, f, staged, cx) {
  const cur = gg.scm.file;
  if (cur && cur.path === f.path && cur.staged === staged) closeFile(gg);
  else {
    gg.scm.file = { ...f, staged }; clearDiff(gg);
    gg.expanded = null; gg.compare = null; gg.details = null; gg.openFile = null;
    loadDiff(gg, cx);
  }
  cx.notify();
}

function loadDiff(gg, cx) {
  const f = gg.scm.file, repo = gg.view?.repo;
  if (!f || !repo) return;
  cx.spawn(async (cx) => {
    let lines;
    try { lines = await scmDiff(repo, f, f.staged); }
    catch (e) { lines = [`Cannot preview this diff: ${e.message ?? e}`]; }
    if (gg.scm.file?.path !== f.path || gg.scm.file?.staged !== f.staged) return;
    // Same text after a refresh: keep the editor, its selection and scroll.
    const text = lines.join("\n");
    if (gg.scm.diff?.text !== text) gg.scm.diff = new DiffText(lines);
    cx.notify();
  });
}

function op(gg, steps, cx, done) {
  const v = gg.view;
  if (!v || gg.scm.busy || !steps.length) return;
  gg.scm.busy = true; gg.scm.note = null; cx.notify();
  cx.spawn(async (cx) => {
    try { await runSteps(v.repo, steps); done?.(); }
    catch (e) { gg.scm.note = String(e.message ?? e); }
    finally { gg.scm.busy = false; gg.scmH.bump(); gg.refresh(cx); cx.notify(); }
  });
}

const stage = (gg, files, cx) => op(gg, [["add", "-A", "--", ...pathsOf(files)]], cx);
const unstage = (gg, files, cx) => op(gg, [gg.view.data.head ? ["reset", "-q", "HEAD", "--", ...pathsOf(files)] : ["rm", "--cached", "-r", "-q", "--", ...pathsOf(files)]], cx);

function discard(gg, target) {
  openOverlay({ mod: "git-graph", kind: "dialog", width: 460, height: 210, props: { dialog: target.all ? "discardAll" : "discardFile", target, ctx: gg.ctx(), repo: gg.view.repo } });
}

// Commits the staged changes; with nothing staged, every change (VS Code's smart commit).
export function commit(gg, cx) {
  const { staged, unstaged } = lists(gg), message = gg.scm.message.trim();
  if (!message || (!staged.length && !unstaged.length)) return;
  op(gg, [...(staged.length ? [] : [["add", "-A"]]), ["commit", "-m", message]], cx, () => {
    gg.scm.message = ""; gg.scmInput.set_value(""); closeFile(gg);
  });
}

// ✦ Generate Commit Message: left click generates (picking an agent the first time), right click configures.
function spark(gg, t) {
  const agent = AGENTS.find((a) => a.id === agentOf()), model = MODELS.find((m) => m.id === modelOf());
  return div().id("gg-scm-spark").size(22).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer().text_color(gg.scm.generating ? t.accent : t.muted)
    .hover((x) => x.bg(t.hover).text_color(t.foreground))
    .tooltip(gg.scm.generating ? "Generating…" : `Generate Commit Message${agent ? ` (${agent.label} · ${model.label})` : ""} · right-click to configure`)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openConfigMenu(gg); })
    .on_click((_e, cx) => { cx.stop_propagation(); sparkClick(gg, cx); })
    .child(gg.scm.generating ? svg(ICON("spinner")).size(14).spin(900) : svg(ICON("sparkles")).size(14));
}

function button(t, id, icon, tip, onClick, size = 22) {
  return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer().text_color(t.muted)
    .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
    .child(svg(ICON(icon)).size(14));
}

export function renderScm(gg, t) {
  const s = gg.scm, { staged, unstaged } = lists(gg);
  const branch = gg.view?.data.headBranch ?? "detached HEAD";
  const can = Boolean(s.message.trim() && (staged.length || unstaged.length) && !s.busy);

  const section = (key, title, files, actions, rowActions, isStaged) => {
    const hidden = s.hide[key];
    const head = h_flex().id(`gg-scm-${key}`).h(24).flex_none().px(4).gap(2).items_center().rounded(4).cursor_pointer().hover((x) => x.bg(t.hover))
      .on_click((_e, cx) => { s.hide[key] = !hidden; cx.notify(); })
      .child(svg(ICON(hidden ? "chevron-right" : "chevron-down")).size(14).text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(title))
      .children(actions)
      .child(div().ml(4).min_w(18).h(18).px(5).flex().items_center().justify_center().rounded(9).bg(t.raised).text_size(10.5).text_color(t.muted).child(String(files.length)));
    const rows = hidden ? [] : files.map((f) => {
      const parts = f.path.split("/"), name = parts.pop();
      const on = s.file?.path === f.path && s.file?.staged === isStaged;
      return h_flex().id(`gg-scm-${key}-${f.path}`).h(22).flex_none().pl(22).pr(4).gap(6).items_center().rounded(4).cursor_pointer()
        .when(on, (e) => e.bg(t.selected)).hover((x) => x.bg(t.hover))
        .tooltip(f.old ? `${f.old} → ${f.path}` : f.path)
        .on_click((_e, cx) => pick(gg, f, isStaged, cx))
        .child(h_flex().flex_1().min_w(0).items_center()
          .child(div().flex_none().max_w(170).truncate().when(f.status === "D", (e) => e.line_through()).child(name))
          .child(div().pl(6).min_w(0).truncate().text_size(11).text_color(t.dim).child(parts.join("/"))))
        .children(rowActions(f))
        .child(div().w(14).flex_none().text_center().text_size(11).font_bold().text_color(color(t, f.status)).child(f.status));
    });
    return v_flex().flex_none().child(head).children(rows);
  };

  return v_flex().id("gg-scm").w(SCM_W).flex_none().h_full().min_h(0).border_l(1).border_color(t.border).bg(t.surface)
    .child(h_flex().h(32).flex_none().pl(10).pr(4).gap(2).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().font_bold().text_size(12).child("Changes"))
      .child(button(t, "gg-scm-commit-icon", "check", "Commit", (cx) => commit(gg, cx)))
      .child(button(t, "gg-scm-refresh", "refresh", "Refresh", (cx) => { gg.scmH.bump(); gg.refresh(cx); }))
      .child(button(t, "gg-scm-close", "x", "Close", (cx) => toggleScm(gg, cx))))
    .child(v_flex().flex_none().p(8).gap(6)
      .child(h_flex().id("gg-scm-message").w_full().min_h(30).pl(8).pr(3).py(3).gap(4).items_start().rounded(6).border_1().border_color(s.typing ? t.accent : t.input).bg(t.background).cursor_text()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(div().flex_1().min_w(0).pt(3).child(Textarea.new(gg.scmInput).w_full().text_size(12).text_color(t.foreground)))
        .child(spark(gg, t)))
      .child(h_flex().id("gg-scm-commit").w_full().h(28).gap(6).items_center().justify_center().rounded(6)
        .bg(can ? t.solid : t.raised).text_color(can ? t.solid_foreground : t.dim).text_size(12)
        .when(can, (e) => e.cursor_pointer().hover((x) => x.opacity(0.9)))
        .tooltip(staged.length || !unstaged.length ? `Commit staged changes on "${branch}"` : `Nothing staged: stage everything and commit on "${branch}"`)
        .on_click((_e, cx) => commit(gg, cx))
        .child(svg(ICON("check")).size(13))
        .child(s.busy ? "Working…" : staged.length || !unstaged.length ? "Commit" : "Commit All"))
      .when(Boolean(s.note), (e) => e.child(div().id("gg-scm-note").max_h(80).overflow_y_scrollbar().text_size(11).text_color(t.ansi1).child(s.note))))
    .child(v_flex().id("gg-scm-list").flex_1().min_h(0).overflow_y_scrollbar().px(4).pb(8).gap(2).text_size(12.5)
      .when(!gg.view, (e) => e.child(div().p(8).text_color(t.dim).child("No repository")))
      .when(Boolean(gg.view && !staged.length && !unstaged.length), (e) => e.child(div().p(8).text_color(t.dim).child("No changes")))
      .when(staged.length > 0, (e) => e.child(section("staged", "Staged Changes", staged,
        [button(t, "gg-scm-unstage-all", "minus", "Unstage All Changes", (cx) => unstage(gg, staged, cx))],
        (f) => [button(t, `gg-scm-u-${f.path}`, "minus", "Unstage Changes", (cx) => unstage(gg, [f], cx), 20)], true)))
      .when(unstaged.length > 0, (e) => e.child(section("changes", "Changes", unstaged,
        [button(t, "gg-scm-discard-all", "undo", "Discard All Changes", () => discard(gg, { all: true, tracked: unstaged.some((f) => !f.untracked), untracked: unstaged.some((f) => f.untracked) })),
          button(t, "gg-scm-stage-all", "plus", "Stage All Changes", (cx) => stage(gg, unstaged, cx))],
        (f) => [
          ...(f.conflict ? [] : [button(t, `gg-scm-d-${f.path}`, "undo", f.untracked ? "Delete File" : "Discard Changes", () => discard(gg, { path: f.path, untracked: Boolean(f.untracked) }), 20)]),
          button(t, `gg-scm-s-${f.path}`, "plus", f.conflict ? "Mark as Resolved" : "Stage Changes", (cx) => stage(gg, [f], cx), 20),
        ], false))));
}
