# AGENTS.md

Rules for anyone who changes this repository.

## 1. Commits

### One commit, one thing

- A commit does one thing, and its subject says it without "and" or a list of
  features. If the subject needs a comma or an "and" to be true, split it.
- Keep the kinds of change apart. These are never in one commit:
  - a mechanical change (a reformat, a rename, moving files, removing unused
    code) and a change of behavior;
  - a refactor, a new feature and a bug fix;
  - a change of a rule or a tool and the files that change because of it.
- When a new rule makes old code fail, the order is: first the commit that
  fixes the old code (it passes the checks of the old rule), then the commit
  that adds the rule (it passes its own check). Each commit passes the checks
  by itself.
- A change goes in with its tests and its documentation, in the same commit.
  A test or a note for something committed before is a commit of its own.
- Do not mix in what was not asked for: no drive-by fixes, no unrelated
  formatting. Note it and make a separate commit.
- Stage by path (`git add <paths>`), never `git add -A` or `git add .`, and
  read `git status` and `git diff --cached` before committing. Files that are
  made by tools or machines (build output, logs, scratch) are not committed.

### The message

The style is the GNU one: a short subject, a blank line, and a body that tells
what changed and why.

- Subject: `<area>: <summary>`.
  - `<area>` is the part of the repository that changes, in lower case
    (`avalonia`, `linux`, `mobile`, `web`, `i18n`, ...).
  - The summary starts with a lower-case letter, has no full stop at the end,
    and says what the commit does, in 72 characters or fewer in all.
  - Say the thing itself ("copy the pixels of a video frame outside the lock"),
    not the activity ("fix bug", "update code", "changes").
- Body: after a blank line, wrapped at 72 characters. Say
  - what was wrong or missing, and what the commit does about it;
  - why it is done this way, when another way looks as likely;
  - what is left out or not known, when that matters (a limit, something not
    measured, something not run on a real device).
    Say only what is true: what was measured, run or read. Do not describe how
    the code works line by line; the diff does that.
- A commit that only repeats its subject in the body may leave the body out.
- English only. No emoji, no issue numbers or tickets in the subject, no
  "WIP", "misc" or "fix review comments".

Example:

```
avalonia: copy the pixels of a video frame outside the lock

VideoOutput held its lock while the screen copied a whole frame, so
libvlc waited to draw the next one. It now has three buffers (the one
being drawn, the last drawn, the one being copied) and only swaps them
under the lock; the copy is outside it.
```

### Before and after committing

- Run the checks of the part that changed before committing. For
  `src/avalonia`: `./format.sh`, then only the tests that concern the change
  (`./test.sh <TestClass>...`); `./test-all.sh` is for broad or cross-cutting
  changes.
- The pre-commit hook must pass. Fix what it reports; do not skip it with
  `--no-verify`.
- Do not rewrite history that has been pushed (`--amend`, rebase, force
  push). A wrong commit is corrected by a new commit.
- Commit when you are asked to, or when the task you are running says to. A
  new convention or rule document is shown to its owner before it is
  committed.

## 2. Language

Everything written in the repository is in English: code, identifiers,
comments, documentation, test names, commit messages and the texts of errors
and logs.

The one exception is the translations themselves: the values in
`src/i18n/locales/<id>.toml` are in the language of the file. The keys are
English.

## 3. Checks and hooks

The hooks are installed by `pnpm install` (the `prepare` script, with
simple-git-hooks).

- **pre-commit** runs, in this order:
  1. `pnpm -s format:check`: Prettier over everything. Fix with `pnpm format`.
  2. `pnpm -s lint --quiet`: ESLint. Fix with `pnpm lint:fix`.
  3. `scripts/check-avalonia-format.sh`: only when the commit touches C# in
     `src/avalonia` (or `.editorconfig`, `Directory.Build.props`,
     `dotnet-tools.json` or `format.sh` there). It takes about a minute. Fix
     with `src/avalonia/format.sh`.
- **pre-push** is Git LFS (the pictures in `screenshots/` are in LFS), so
  `git-lfs` must be installed.
- The hooks do not run the type check or the tests. For TypeScript changes run
  `pnpm typecheck` and `pnpm test` yourself; for `src/avalonia` see section 4.
- Do not bypass a hook (section 1). If a check is wrong, fix the check in its
  own commit.

## 4. Avalonia (`src/avalonia`)

The rules are in `src/avalonia/code-style.md`; read it before you write C#.
The hard ones:

- The project is fully AOT-compiled: no reflection, no code generated at run
  time. Use the source generators (for example `GeneratedRegex`) instead of
  building a regex from a string.
- No AXAML: all UI is made in C#.
- The format is made by the tool, not by hand: `./format.sh` rewrites the
  files, `./format.sh --check` is what the pre-commit hook runs. Lines are at
  most 80 characters, namespaces are file-scoped, and an unused `using` is an
  error that fails the build.
- The bindings of the Matrix SDK (`OhMatrix.MatrixSdk/native`) are generated.
  Do not edit or tidy them by hand.
- The first `PropertyGroup` of every `.csproj` has the properties of
  `code-style.md`, in that order.

Behavior follows the React Native app (`src/packages/app`): a page or a feature
it has, Avalonia has. Where the two engines differ, the Rust engine
(`src/packages/engine-rust`) is the reference, not the JS one.

Tests (xunit, with headless Avalonia for the UI):

- `./test.sh <TestClass>...` or `./test.sh -m <method>` runs only the tests
  that concern your change. Use it by default.
- `./test-all.sh` runs everything. Use it for broad or cross-cutting changes.

Media is not bundled: playing audio and video needs `libvlc`, and calls need
GStreamer with its WebRTC plugins. A feature is off where its library is
missing. `src/avalonia/README.md` lists the libraries.

## 5. Texts

Every text a person reads comes from `src/i18n/locales/*.toml`, not from the
code. React Native uses them through generated TypeScript, Avalonia embeds the
TOML files, so one key serves both.

- English (`en.toml`) is the source: a key exists there first. A language
  that lacks a key shows the English text.
- `src/i18n/src/generated.ts` is generated. Do not edit it. After you change a
  TOML file, run the code generation and the tests of the package:
  `pnpm --filter @ohmatrix/i18n test` (it runs `codegen` first).
- A new language is an entry in `languages.toml` and a file with all the keys.
- Put no sentence in the code that a person will see.

## 6. Design of the interface

Follow Telegram, Apple's Human Interface Guidelines and Fluent. Do not use
Google's Material Design: no Material components, ripples or floating action
buttons. The same holds for both clients, React Native and Avalonia.

## 7. Servers for testing

Use a local server for anything that writes: tests, and trying a feature by
hand.

- `pnpm synapse:up` starts a local Synapse (Docker) on
  `http://localhost:8008`, server name `localhost`, and seeds users for
  testing; their names and password are at the top of
  `src/dev/synapse/up.sh`. `pnpm synapse:down` stops it, and
  `src/dev/synapse/up.sh reset` starts again from nothing. Its data is in
  `src/dev/synapse/data`, which git ignores.
- `pnpm test:e2e` (Playwright) needs that server running. `pnpm test:live`
  runs the engine tests against a live server.
- Do not put an access token, a password of a real account, or a saved
  session in the repository, in a commit message or in a log you commit.
