# Add a "Git Graph" button to the tab bar

Herdr's tab bar is the shipped `tabs` mod, and its **Files** / **Changes** buttons are written
into its code (`mods/tabs/main.js`); the panels they open are written into the shipped `main`
layout. A mod can't add a button there, and Herdr replaces its own layouts and mods on every
start, so the way to get one is Herdr's own: **clone the layout and the tab bar, then edit the
clones**. Your current layout stays as it is; `ctrl-shift-l` switches between them.

Takes two minutes. Install the mod first (`./install.sh`).

## 1. Clone the layout and the tab bar

```sh
herdr-app do layout.clone '{"name":"main","as":"my-layout"}'   # also switches to it
herdr-app do mod.clone '{"name":"tabs","as":"my-tabs"}'
```

In `~/.config/herdr-app/layouts/my-layout.json`, point the tab bar block at the clone:

```json
{ "id": "tabs", "type": "block", "content": { "mod": "my-tabs" }, ... }
```

## 2. Add the button

In `~/.config/herdr-app/mods/my-tabs/main.js`, right after the line that defines `stop`:

```js
    const stop = (_e, cx) => cx.stop_propagation();
    // The Git Graph tab of this space, if one is open.
    const graphTab = (space?.tabs ?? []).find(tab => panes().some(p => p.tab === tab.id && p.mod === "git-graph"));
```

and after the Changes button line (`.when(enabled.includes("changes"), …)`):

```js
      .child(h_flex().id("tab-git-graph").h(26).px(8).gap(5).flex_none().items_center().rounded(6).text_size(12)
        .bg(graphTab?.active ? t.selected : t.chrome).text_color(graphTab?.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => graphTab ? run("tab.select", { id: graphTab.id }) : run("tab.new", { mod: "git-graph", name: "Git Graph", props: { tab: true } }))
        .child(svg("mods/git-graph/graph.svg").size(14)).child("Git Graph"))
```

The button opens the graph as a tab, or goes to it if the space already has one. To have
the Changes button gone, delete its line.

Prefer the graph as a window over everything (like `ctrl-shift-g`)? Use
`.on_click(() => run("mod.open", { name: "git-graph" }))` instead.

## 3. Optional: a graph icon on the tab

Replace the `const program = …` line inside the tab item with:

```js
      const program = panes().some(p => p.tab === c.id && p.mod === "git-graph") ? { icon: "mods/git-graph/graph.svg", tint: true }
        : panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
```

## 4. Optional: follow the terminal you were just in

While a Git Graph tab is shown, the graph itself has the focus, so by default it takes the
repo from the space's terminals (the first one that is in a repo). To make it follow the
**last focused terminal**, let the tab bar record it. Add `focused` and `setShared` to the
`herdr` import, change `render()` to `render(cx)`, and after `const space = …` add:

```js
    const fp = panes().find(p => p.pane === focused()?.pane);
    if (space && fp?.terminal && fp.cwd && shared("git-graph.focus")?.[space.id]?.cwd !== fp.cwd)
      cx.spawn(async () => setShared("git-graph.focus", { ...(shared("git-graph.focus") ?? {}), [space.id]: { cwd: fp.cwd, on: space.machine ?? null } }));
```

## Check

```sh
herdr-app check ~/.config/herdr-app/mods/my-tabs
herdr-app status   # no layout or mod errors
```

Clones are yours: Herdr never updates them. After a Herdr update, compare with the new
`mods/tabs/main.js` if you want its changes too.
