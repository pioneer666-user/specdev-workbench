# SpecDev Workbench getting-started guide

[Project introduction](../../README.md) · [简体中文](guide.zh.md)

This guide describes existing 0.2.3 features and was added to public main after release. It is not in the published 0.2.3 tag or npm package. To explore a room first, download the [offline example](https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.3/specdev-reading-list-0.2.3.html), save the HTML and open it in a browser.

## Installation and upgrades

### Host and CLI

The plugin runs in [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). See the [official DSH documentation](https://deepseek-harness.github.io/deepseek-harness/) for host installation, model setup and workspaces. Finish setup and confirm that you can open a project and chat before installing the plugin.

The verified environment is Windows / DSH Desktop and Web 0.2.0-rc.2, not every past or future host. Your CLI, profile and data root must match the actual Desktop or Web instance. Do not use a separately installed Web CLI to update the Desktop profile.

See the [README](../../README.md#first-install-windows-desktop) for Desktop commands. For Web, `dsh` means your actual host CLI; the short command may not be on your PATH. For the verified host version launched through npm, the corresponding invocation is:

~~~sh
npx --package=@deepseek-ai/dsh@0.2.0-rc.2 dsh plugin --profile web add @pioneer_zmc/dsh-workbench@0.2.3 --registry=https://registry.npmjs.org/
~~~

For a source-based DSH host, run `pnpm dsh plugin --profile web add @pioneer_zmc/dsh-workbench@0.2.3 --registry=https://registry.npmjs.org/` in **your DSH source repository**, preserving its actual version and data root. This command does not belong in the plugin source repository. Prepare Node.js and pnpm as required by the host; a changed host version needs its own compatibility check.

### Data roots and upgrade protection

Save work and stop the corresponding instance before installation. Exit Desktop through its menu or tray and confirm the background instance ended. Keep the original `DSH_HOME`: leave it unset if it was unset; for a custom root, the CLI and host must use the same actual root. Creating a new root just to follow an example can make your original workspaces or configuration appear missing.

If you already use a custom root, set `$env:DSH_HOME = '<your existing actual data root>'` in the installation PowerShell terminal, replacing the placeholder. It affects only that terminal and its children. Preserve that same root when launching the host elsewhere. Even with separate roots, Electron preferences, caches and single-instance behavior may be shared within one Windows account.

Before upgrading, record the installed package identity and back up the profile's `package.json`, `pnpm-lock.yaml` and custom `cordis.patch.yml`. The current identity is `@pioneer_zmc/dsh-workbench`. Use the README's exact-version add command with the same profile; verify the version and original configuration before restarting.

Reinstalling the same version may not update the actual files. Only when reinstallation is needed, remove the actual installed plugin and add it again using **the same CLI and profile**. For the current Desktop identity:

~~~powershell
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop remove '@pioneer_zmc/dsh-workbench'
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add '@pioneer_zmc/dsh-workbench@0.2.3' '--registry=https://registry.npmjs.org/'
~~~

`$DesktopDir` is your actual installation directory from the README. For Web, use its own CLI with `--profile web`. Keep data roots, other plugins and project materials intact; do not install two SpecDev package identities together. Verify custom configuration after reinstallation; a successful command alone does not prove all data and settings were restored.

### Local package from GitHub

Download `specdev-dsh-workbench-0.2.3.tgz` and `SHA256SUMS.txt` from the [0.2.3 Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.3), verify SHA256, and put the package at a path without spaces. Use the matching CLI's `plugin --profile desktop add <local-tgz-path>` or `plugin --profile web add <local-tgz-path>`, following the stop/data-root/configuration rules above. On Windows, calculate the digest with `Get-FileHash -Algorithm SHA256 '<local-tgz-path>'`.

Both channels published the same fixed package. Complete anonymous downloads of the formal GitHub assets have not passed verification in the execution environment; authenticated draft readback and complete npm download were verified. Browser and command-line networking can behave differently. Opening a webpage does not verify the complete package.

## From materials to your first room

### Choose a project

Create or select a workspace at a Git repository root in DSH, then open the workbench from the sidebar. Desktop uses the central panel with **Return to chat**; Web opens a new tab. The workbench lists project names and full paths: check that you selected the intended project.

For an empty list, create a workspace and refresh. Read failures can be retried; manual configuration remains available. If you already configured `repoRoot`, check its value rather than adding duplicate plugin entries. Only if manual selection is needed, edit the existing configuration by ID:

~~~yaml
- id: specdev-workbench
  config:
    repoRoot: '<your actual Git repository root>'
~~~

Preserve other custom fields and replace the placeholder. Materials must use the current `docs/specdev` registration format; documents elsewhere in the repository are not automatically registered subjects.

### Prepare and register materials

Use the bundled [specdev-business skill](../../skills/specdev-business/SKILL.md) in the selected project's chat. Give it the subject name, target repository, allowed branch, requirements or existing documents, and the actual workbench entry. The AI confirms missing information together. Adapt the README's natural-language example to your own subject and requirements.

The skill prepares a specification, workflow or lifecycle diagrams as needed, node explanations and registration files. `project.json` registers the project, `business.json` registers the subject and document paths, and each diagram directory has `chart.json`. Documents use repository-root-relative paths and can stay in their original locations. These names explain the files; beginners need not write the JSON themselves.

Mark new designs as proposed, without fabricating evidence of implementation. Preserve real evidence when maintaining existing subjects. Complete the skill's diagram and registration checks, then review the content yourself. Materials are not automatically inferred correct conclusions from code; unresolved requirements need your decisions. Saving a version in the UI only adds an **annotated Git tag to committed content**; it does not commit files or change branches for you. Saving is your choice.

### Arrange and validate

With registered materials, use [specdev-room](../../skills/specdev-room/SKILL.md) directly. Specify the project, subject and forest/ceramic style. “Arrange the rest for me” lets the AI choose the combination; you can also request minimal furnishing, quantities, required or excluded items. The furniture catalog lets you select models and copy the list back to chat.

The skill reads templates, furniture metadata and dimensions from the same actual installed package, adapts a [furnished layout](../../skills/specdev-room/references/furnished-layouts.md) to your real subject, and binds its registered materials. Forest maps to `fairy`; ceramic maps to `ceramic`. It writes only `docs/specdev/<businessId>/room.json`, without changing documents, diagrams, building blueprints or the installed package, or generating/downloading models.

Trial placement and floor/support-surface recommendations provide bounded suggestions without automatic writes or a guarantee that arbitrary coordinates are valid. Finish with the **actual installed package's** complete check:

~~~text
node "<actual plugin package root>/dist/check-room.js" "<actual Git project root>" "<businessId>" --json
~~~

The AI must locate the package from its actual skill-loading path, not guess a personal installation path or build automatically. Only exit 0 with `kind=checked` and `ok=true` passes room configuration and registered-material checks; diagram compilation is checked separately. Unconfirmed reachability cannot be accepted. Do not delete bindings, shrink the character or bypass constraints to pass. After two unsuccessful repair rounds for the same problem, return the diagnostics. Validation does not replace your visual, reading and walking checks; results across every model, style and host have not been established.

## Using the room

- Inspect the overview, then enter and walk to a reading spot. Whole-building overview and walking remain available through [specdev-building](../../skills/specdev-building/SKILL.md).
- The twelve furniture models are bookshelf, desk, table lamp, notice board, display stand, vase, plant, book stack, bed, reading chair, low cabinet and floor lamp. All can bind registered documents and diagrams; decoration may have no bindings. Selecting furniture and opening reading are separate actions. Find the complete list under **Room furniture → Expand browsing → All room materials**. Reading pauses walking; closing restores your previous browsing position.
- The sun control adjusts brightness. The main sound button toggles all sound; its arrow only opens master volume and does not start playback. Display/weather/sound settings keep a stable window with internal scrolling.
- Adjust rain amount, ambience, footsteps and rain volume in settings. Brightness changes day/night ambience; rain adds wet reflections. Forest bird/insect ambience fades to silence at rain amount 30. Backgrounding pauses sound; on return, open volume and manually choose **Click to resume playback**.
- Brightness, weather, sound choices/volumes and furniture visibility last only for this page; reload/re-entry restores defaults. Hiding furniture in overview is temporary and walking restores it, without rewriting the layout. Sitting animations and furniture light switches are not supported.

## Export and sharing

Choose **Export room**, select current subject materials, then **Export HTML**. An empty selection exports the room alone. The selected theme/brightness can be retained; the exported room starts sunny and silent without weather or sound preferences.

The room and selected registered Markdown documents/workflow/lifecycle diagrams work offline. Export does not include the whole project or history. In the plugin, source evidence is read from exact local Git commits; shared HTML contains pinned remote source links, not repository source snippets. Links need networking/private-repository access, and their reachability is not checked automatically. Documents themselves may contain code or sensitive text: review content and scope before sharing.

External document images are not bundled and appear as placeholders. Limits: 64 documents, 16 diagrams, 32 MiB input, 64 MiB HTML output. After errors/cancellation, choose again. Starting a download does not prove the file was saved; use **Download file** if needed. The plugin does not save another HTML copy in your project; keep your downloaded file. Closing the export panel releases temporary data and the next export regenerates it.

## Historical migration and full limits

Current package: `@pioneer_zmc/dsh-workbench`; plugin/sidebar ID: `specdev-workbench`; client module: `@pioneer_zmc/dsh-workbench/client`; page/API prefix: `/specdev-workbench`. Data root: `docs/specdev`; six formal schemas: `specdev/*/1`. Building formats and snapshot tags use SpecDev names; snapshot tags start with `specdev/`.

The 0.1.x `archify-maker`/`archify-house` skills became `specdev-business`/`specdev-building`, with `specdev-room` added. Only new roots, formats and tags are read. There are no old URL/skill aliases or guarantees for old bookmarks. Old files/tags remain intact without automatic migration. Agree migration separately for each project rather than bulk renaming; registered materials can retain original repository paths.

GitHub 0.2.1 used `@specdev/dsh-workbench`; npm 0.2.1 used `@pioneer_zmc/dsh-workbench`; earlier versions used `@specdev/dsh-archify-manage`. Old tags and packages remain intact; lossless migration of every old version has not been verified. Historical [GitHub 0.2.1](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.1), [GitHub 0.2.2](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.2) and [npm 0.2.2](https://www.npmjs.com/package/@pioneer_zmc/dsh-workbench/v/0.2.2) remain available. Older screenshots remain at their original locations: [ceramic](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.2/web/assets/screenshots/ceramic-room.png), [fairy](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.2/web/assets/screenshots/fairy-room.png).

Workflow and lifecycle authoring/registration are supported; sequence and other upstream types are not exposed as subject materials. Legacy workflows and historical snapshots remain readable without automatic graph upgrades. Floor placement and one level of tabletop support are available; in-page editing, arbitrary scaling, wall mounting, nested supports, cross-room connections and sitting animations are not.

Verification covers Windows / DSH Desktop and Web 0.2.0-rc.2. Other platforms, actual system theme mode, future hosts and every old-version migration are not covered. Room-plus-material performance results apply to the tested machine and materials, not arbitrary complex JavaScript pages.

## Source builds and development samples

This section is for source developers. Obtain the [public source repository](https://github.com/pioneer666-user/specdev-workbench), then run sequentially from **that plugin repository root** with Node.js ≥22. The npm package contains runtime artifacts, not source build scripts:

~~~sh
npm install
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
npm pack --ignore-scripts --pack-destination .
~~~

This produces `pioneer_zmc-dsh-workbench-0.2.3.tgz`. Renderer and read-only validators are included in source; no research repository is required. Use main to read this guide. To reproduce the original released source, check out `v0.2.3`; it does not contain the later guides.

Generate fictional development materials with:

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

The target must not exist; existing projects are not overwritten. Open the generated directory as a DSH workspace. It includes compatibility and intentionally invalid test materials and is distinct from the furnished room example above. See the [sample README](https://github.com/pioneer666-user/specdev-workbench/blob/v0.2.3/sample/README.md). Optional `node scripts/smoke.mjs` and `node scripts/check-save.mjs` run serially in separate samples without using your business project.

See [README acknowledgments](../../README.md#license-and-acknowledgments) for licenses, model/audio provenance and Archify, Marked, Three.js and other third-party notices. Original texts remain in source and the package.
