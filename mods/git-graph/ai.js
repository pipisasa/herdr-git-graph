// Generate a commit message with an AI agent (the ✦ button in the Changes panel).
// First click with no agent chosen: a popup to pick one; right-click: "Configure AI Agent…".
// The choice is shared ("git-graph.ai") so every graph uses it. A pick made in the popup asks the
// graph of that repo to generate through shared "git-graph.ai-run" (a popup is its own view).
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, shared, setShared, openOverlay, closeOverlay, home } from "herdr";
import * as fs from "fs/promises";

// Each run's steps, for when a generation misbehaves: ~/.config/herdr-app/data/git-graph/ai.log
async function log(line) {
  try {
    const dir = `${home()}/.config/herdr-app/data/git-graph`;
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(`${dir}/ai.log`, `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

const ICON = (n) => `mods/git-graph/${n}.svg`;

export const AGENTS = [
  { id: "claude", label: "Claude CLI", hint: "claude -p" },
  { id: "other", label: "Other (soon…)", soon: true },
];

const PROMPT = [
  "Write a git commit message for the changes on stdin (recent commits, status, then the diff).",
  "Match the style of the recent commits (e.g. Conventional Commits if they use it).",
  "First line: a subject of at most 72 characters. If the change needs it, a blank line and a short body wrapped at 72.",
  "Output only the commit message: no code fences, quotes, or commentary.",
].join(" ");

// Recent subjects, status and the diff (staged, else everything against HEAD), capped, into the agent.
const SCRIPT = `G="git --no-optional-locks -c core.quotepath=false"
{ echo "Recent commits:"; $G log --oneline -12 2>/dev/null; echo; echo "Status:"; $G status --short; echo; echo "Diff:"
  if [ "$2" = staged ]; then $G diff --cached --no-color; else $G diff HEAD --no-color 2>/dev/null || $G diff --no-color; fi
} | head -c 200000 | claude -p "$1"`;

export const agentOf = () => (shared("git-graph.ai") ?? {}).agent ?? null;

export function openAgentMenu(gg, configure) {
  openOverlay({ mod: "git-graph", kind: "popup", width: 260, height: 26 * (AGENTS.length + 1) + 14, props: { menu: "ai", configure, root: gg.root } });
}

export function openConfigMenu(gg) {
  openOverlay({ mod: "git-graph", kind: "popup", width: 220, height: 38, props: { menu: "ai-config", root: gg.root } });
}

// The ✦ click: generate with the chosen agent, or pick one first.
export function sparkClick(gg, cx) {
  if (!agentOf()) openAgentMenu(gg, false);
  else generate(gg, cx);
}

// A pick in the popup asked for a message: the graph of that repo with the panel open makes it.
export function checkAiRequest(gg, cx) {
  const req = shared("git-graph.ai-run");
  if (!req || req.at === gg.aiSeen) return;
  gg.aiSeen = req.at;
  if (req.root === gg.root && gg.scm.open && Date.now() - req.at < 10000) cx.spawn(async (cx) => generate(gg, cx));
}

export function generate(gg, cx) {
  const v = gg.view, s = gg.scm;
  if (!v || s.generating) return;
  const { staged, unstaged } = v.data.scm;
  if (!staged.length && !unstaged.length) { s.note = "No changes to describe"; cx.notify(); return; }
  if (agentOf() !== "claude") { openAgentMenu(gg, false); return; }
  s.generating = true; s.note = null; cx.notify();
  const root = v.repo.root, t0 = Date.now();
  cx.spawn(async (cx) => {
    try {
      log(`start ${root} (${staged.length ? "staged" : "all"})`);
      const r = await exec("sh", ["-c", SCRIPT, "_", PROMPT, staged.length ? "staged" : "all"], { cwd: root, on: v.repo.on, timeout: 180000 });
      log(`exit ${r.code} after ${Date.now() - t0}ms · stdout ${r.stdout.length}b · stderr ${JSON.stringify(r.stderr.slice(0, 500))}`);
      if (gg.root !== root) { log("repo changed meanwhile: dropped"); return; }
      if (r.code === 127 || /claude: (command )?not found/.test(r.stderr)) throw new Error("Claude CLI not found: install it (claude.com/claude-code) and sign in");
      if (r.code !== 0) throw new Error((r.stderr || r.stdout || `claude exited with ${r.code}`).trim());
      const message = r.stdout.trim().replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
      if (!message) throw new Error("The agent returned an empty message");
      s.message = message; gg.scmInput.set_value(message);
      log("message set");
    } catch (e) { s.note = `Generate failed: ${e.message ?? e}`; log(`failed: ${e.message ?? e}`); }
    finally { s.generating = false; cx.notify(); log("done"); }
  });
}

// ---------------------------------------------------------------- popups (menu role)

export function renderAiMenu(view, p, t) {
  const current = agentOf();
  const close = () => closeOverlay(p.overlay);
  const item = (id, onClick, children, enabled = true) => h_flex().id(id).h(26).px(10).gap(8).items_center().rounded(5).flex_none()
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(onClick)).when(!enabled, (e) => e.text_color(t.dim))
    .children(children);
  const base = v_flex().id(`gg-${p.menu}`).size_full().p(6).bg(t.popover).text_size(12.5).text_color(t.foreground).track_focus(view.handle)
    .on_key_down((e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } });
  if (p.menu === "ai-config") {
    return base.child(item("gg-ai-configure", () => { close(); openOverlay({ mod: "git-graph", kind: "popup", width: 260, height: 26 * (AGENTS.length + 1) + 14, props: { menu: "ai", configure: true, root: p.root } }); },
      [svg(ICON("settings")).size(13).text_color(t.muted), div().child("Configure AI Agent…")]));
  }
  return base
    .child(div().h(26).px(10).flex().items_center().text_size(11.5).text_color(t.dim).child(p.configure ? "AI agent for commit messages" : "Generate commit message with"))
    .children(AGENTS.map((a) => item(`gg-ai-${a.id}`, () => {
      setShared("git-graph.ai", { ...(shared("git-graph.ai") ?? {}), agent: a.id });
      if (!p.configure) setShared("git-graph.ai-run", { root: p.root, at: Date.now() });
      close();
    }, [
      div().w(12).flex_none().text_size(11).text_color(t.accent).child(current === a.id ? "✓" : ""),
      div().flex_1().min_w(0).truncate().child(a.label),
      ...(a.hint ? [div().text_size(11).text_color(t.dim).child(a.hint)] : []),
    ], !a.soon)));
}
