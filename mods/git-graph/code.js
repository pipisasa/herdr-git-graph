// Selectable text for the previews.
// Diffs: the coloured rows (old/new numbers, green/red lines, hunk headers) with a selection of
// our own: drag, double-click a word, triple-click a line, Cmd/Ctrl-C copies (without the +/−
// markers), Cmd/Ctrl-A takes the whole diff. Rows sit in a plain scrolling column (not a virtual
// list: its rows can't take mouse events) and the handlers sit on the tall content block, so a
// pointer's local position is its place in the diff whatever the scroll.
// Commit details: selectable TextViews.
import { div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar } from "gpui-base";
import { theme, settings } from "herdr";

const ROW = 18, FONT = 11.5, CHAR = FONT * 0.6; // monospace advance: 0.6em (JetBrains Mono, SF Mono, Menlo)
const GUTTER = 32 + 8 + 32 + 8 + 10 + 8, HUNK = 12; // where a row's text starts (columns + gap(8)), in px

// Text draws a tab as nothing: pad each to the next 4-column stop.
const untab = (text) => text.replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));

/** Numbers each diff line once. */
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, old: old++, text: untab(line.slice(1)) };
    if (kind === "+") return { kind, number: next++, text: untab(line.slice(1)) };
    if (kind === " ") return { kind, old: old++, number: next++, text: untab(line.slice(1)) };
    return { kind: "", text: line };
  });
}

const isWord = (ch) => /[\p{L}\p{N}_$]/u.test(ch);
const before = (a, b) => a.row < b.row || (a.row === b.row && a.col <= b.col);

export class DiffText {
  constructor(lines) {
    this.text = lines.join("\n");
    this.rows = diffRows(lines);
    this.width = Math.max(300, ...this.rows.map((r) => r.text.length * CHAR + GUTTER + 24));
    this.anchor = null; this.head = null; this.dragging = false;
  }

  // Row and column under a point of the content block.
  at(p) {
    const row = Math.max(0, Math.min(this.rows.length - 1, Math.floor(p.y / ROW)));
    const r = this.rows[row], x0 = r.kind === "@" ? HUNK : GUTTER;
    return { row, col: Math.max(0, Math.min(r.text.length, Math.round((p.x - x0) / CHAR))) };
  }

  range() {
    if (!this.anchor || !this.head) return null;
    const [a, b] = before(this.anchor, this.head) ? [this.anchor, this.head] : [this.head, this.anchor];
    return a.row === b.row && a.col === b.col ? null : [a, b];
  }

  selected() {
    const r = this.range();
    if (!r) return null;
    const [a, b] = r, out = [];
    for (let i = a.row; i <= b.row; i++) {
      const t = this.rows[i].text;
      out.push(t.slice(i === a.row ? a.col : 0, i === b.row ? b.col : t.length));
    }
    return out.join("\n");
  }

  selectAll() {
    if (!this.rows.length) return;
    this.anchor = { row: 0, col: 0 };
    this.head = { row: this.rows.length - 1, col: this.rows[this.rows.length - 1].text.length };
  }

  clear() { this.anchor = this.head = null; }

  down(e, cx, focus) {
    if (!e.local_position) return;
    focus?.();
    const p = this.at(e.local_position), t = this.rows[p.row].text;
    if (e.click_count >= 3) { this.anchor = { row: p.row, col: 0 }; this.head = { row: p.row, col: t.length }; }
    else if (e.click_count === 2) {
      let s = p.col, end = p.col;
      while (s > 0 && isWord(t[s - 1])) s--;
      while (end < t.length && isWord(t[end])) end++;
      if (s === end && end < t.length) end++; // a lone symbol
      this.anchor = { row: p.row, col: s }; this.head = { row: p.row, col: end };
    } else if (e.modifiers?.shift && this.anchor) { this.head = p; this.dragging = true; }
    else { this.anchor = p; this.head = p; this.dragging = true; }
    cx.stop_propagation();
    cx.notify();
  }

  move(e, cx) {
    if (!this.dragging) return;
    const p = this.at(e.local_position);
    if (p.row === this.head?.row && p.col === this.head?.col) return;
    this.head = p;
    cx.notify();
  }

  up() { this.dragging = false; }

  // A row with the selected part of its text on the selection colour.
  textCell(t, i, text, sel) {
    const cell = div().flex_1().min_w(0).whitespace_nowrap();
    if (!sel) return cell.child(text || " ");
    const [a, b] = sel;
    if (i < a.row || i > b.row) return cell.child(text || " ");
    const s = i === a.row ? a.col : 0, e = i === b.row ? b.col : text.length;
    const mark = t.selection ?? t.accent + "55";
    // A fully selected empty line still shows one cell of selection, as editors do.
    const mid = text.slice(s, e) || (i < b.row ? " " : "");
    return h_flex().flex_1().min_w(0).whitespace_nowrap()
      .when(s > 0, (x) => x.child(div().flex_none().child(text.slice(0, s))))
      .when(Boolean(mid), (x) => x.child(div().flex_none().bg(mark).child(mid)))
      .when(e < text.length, (x) => x.child(div().flex_none().child(text.slice(e))));
  }

  render(id, focus) {
    const t = theme(), mono = settings().font_family ?? "JetBrains Mono", sel = this.range();
    const row = ({ kind, number, old, text }, i) => {
      if (kind === "@") return h_flex().w_full().px(HUNK).h(ROW).flex_none().bg(t.raised).text_color(t.dim).child(this.textCell(t, i, text, sel));
      return h_flex().w_full().h(ROW).flex_none().gap(8).when(kind === "+", (e) => e.bg(t.ansi2 + "1c")).when(kind === "-", (e) => e.bg(t.ansi1 + "1c"))
        .child(div().w(32).flex_none().text_right().text_color(t.dim).child(old === undefined ? "" : String(old)))
        .child(div().w(32).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
        .child(div().w(10).flex_none().text_color(kind === "+" ? t.ansi2 : kind === "-" ? t.ansi1 : t.dim).child(kind === "+" || kind === "-" ? kind : ""))
        .child(this.textCell(t, i, text, sel));
    };
    return div().flex_1().min_h(0).relative().font_family(mono).text_size(FONT)
      .child(div().id(id).size_full().overflow_scroll()
        .child(v_flex().id(`${id}-text`).min_w(this.width).w_full().cursor_text()
          .on_mouse_down("left", (e, cx) => this.down(e, cx, focus))
          .on_mouse_move((e, cx) => this.move(e, cx))
          .on_mouse_up("left", () => this.up())
          .children(this.rows.map(row))))
      .child(Scrollbar.new(id).absolute().inset_0());
  }
}

// Plain text as markdown that renders literally: every ASCII punctuation escaped (CommonMark allows
// it), leading spaces kept as no-break spaces, line breaks hard ("  \n"), blank lines as paragraphs.
// (TextView.html drops <br>, which ran a commit's subject and body together.)
const escLine = (l) => l.replace(/[!-/:-@[-`{-~]/g, "\\$&").replace(/^ +/, (m) => "&#160;".repeat(m.length));
export const textMarkdown = (s) => s.split(/\n[ \t]*\n/).map((p) => p.split("\n").map(escLine).join("  \n")).join("\n\n");
