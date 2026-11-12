# Git Graph for Herdr

A [Herdr](https://herdr.dev) mod that shows a repository's commit graph the way the
[Git Graph](https://github.com/mhutchie/vscode-git-graph) extension does in VS Code: coloured
branch lanes, ref badges, commit details with changed files and diffs, branch filter, find,
fetch, repository settings and the full context menus (checkout, merge, rebase, cherry-pick,
revert, reset, push, stashes…).

![Git Graph](preview.png)

## Install

```sh
git clone https://github.com/pipisasa/herdr-git-graph
cd herdr-git-graph && ./install.sh
```

`install.sh` copies `mods/git-graph` into `~/.config/herdr-app/mods/` (run it again to update;
a symlink won't do, Herdr doesn't reload through it). Then add the key from `keys.json` to your
`~/.config/herdr-app/keys.json`:

```json
{ "global": { "cmd-g": "mod.open:git-graph" } }
```

## Use

- **`cmd-g`** (Super+G on Linux / Windows) opens the graph over everything, for the repo of the terminal you are in;
  press it again (or Esc) to close. **⤢** moves it into a tab.
- As a tab from a shell: `herdr-app do tab.new '{"mod":"git-graph","name":"Git Graph","props":{"tab":true}}'`,
  or pinned to a repo with `"props":{"folder":"/path/to/repo"}`.
- **A button in the tab bar** next to Files / Changes: [docs/add-button.md](docs/add-button.md).
  Herdr's tab bar can't take buttons from other mods, so it's a two-minute clone-and-edit.
- Click a commit for its details and files, a file for its diff, Cmd/Ctrl-click a second
  commit to compare, right-click for the context menu. ⌘F finds, the gear opens Repository
  Settings, the Repo dropdown lists submodules.
- Key commands for `keys.json` while the graph is shown (`"<key>": "git-graph:<command>"`):
  `down`, `up`, `toggle`, `compare`, `menu`, `find`, `fetch`, `refresh`, `repos`, `settings`, `close`.

## Notes

- It runs `git` (reads never write under `.git`), and `pbcopy` for Copy (macOS only).
- How to rebuild it from scratch: [RECIPE.md](RECIPE.md).

## License

MIT
