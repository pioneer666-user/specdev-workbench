# SpecDev Workbench 0.2.1

English | [简体中文](README.zh.md)

Choose a DSH project, read business documents and workflows, or ask a bundled Skill to arrange an independent room for one business.

## Download and install

### npm channel (0.2.1 preparation; not published yet)

The npm package is `@pioneer_zmc/dsh-workbench`; the existing GitHub package remains `@specdev/dsh-workbench`. Product name, plugin ID, routes and data paths stay the same. Use these commands only after npm publication. See the verification boundaries below.

### Windows Desktop

Save work, exit via the menu or tray, and confirm the background instance ended. Use the bundled Desktop CLI and the actual Desktop DSH_HOME; leave it unset if it was unset before. This example demonstrates a custom root only. CLI and Desktop must share the same root; the variable affects this terminal and its children only.

~~~powershell
$DesktopDir = 'C:\Apps\DSH' # Replace with the actual installation directory
$env:DSH_HOME = 'C:\DSHData\desktop' # Custom-root example; existing users keep their actual root
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add '@pioneer_zmc/dsh-workbench@0.2.1' '--registry=https://registry.npmjs.org/'
& "$DesktopDir\DeepSeek Harness.exe"
~~~

Before upgrading, record the installed package and custom plugin configuration. Remove only an actually installed package with the same bundled CLI's `plugin --profile desktop remove <installed-package>`: GitHub 0.2.x uses `@specdev/dsh-workbench`, earlier releases use `@specdev/dsh-archify-manage`, and npm uses `@pioneer_zmc/dsh-workbench`. Then add, verify the original custom configuration, and restart from the same environment. Do not install old and new packages together or clear data roots. Migration of every old version has not been tested.

The sidebar opens SpecDev Workbench in the central panel. Choose a project and use Return to chat to restore the conversation.

### Web

Stop the corresponding instance and keep its original data root and Web CLI. Apply the same installed-package removal and configuration checks using the web profile.

~~~sh
dsh plugin --profile web add @pioneer_zmc/dsh-workbench@0.2.1 --registry=https://registry.npmjs.org/
~~~

Restart that Web instance. The sidebar opens a new tab with project names and full paths, preserving chat. Create a workspace and refresh an empty list; retry read failures. Both states retain manual configuration. This task does not create a second Web installation, so this command is not evidence of a tested Web install.

### GitHub fallback (original package identity)

[Original-identity 0.2.1 package](https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.1/specdev-dsh-workbench-0.2.1.tgz) · [Original Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.1). Download to a path without spaces and use the appropriate profile's `plugin add <local-tgz-path>`. This existing asset remains `@specdev/dsh-workbench` and must not coexist with the new npm identity. The old [0.2.0 Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.0) remains available.

## Features

- One independent room per business: realistic or fairy base, overview and walking modes, indoor/outdoor passage.
- Twelve furniture assets and rendered thumbnails: bookshelf, desk, table lamp, notice board, display stand, vase, plant, book stack, bed, reading chair, low cabinet and floor lamp. Select items in the catalog and copy the list to your chat.
- Furniture with document capabilities can bind that business's registered documents and workflows. Reading pauses walking; closing resumes in place. Decorative assets do not promise sitting, sleeping, light switches or free drag placement.
- Project/business navigation, interactive workflows, node explanations, pinned source evidence and historical reading. Saving a version only adds an annotated Git tag to committed content.
- Whole-building overview and walking remain available. Three bundled skills: [specdev-business](skills/specdev-business/SKILL.md), [specdev-building](skills/specdev-building/SKILL.md), [specdev-room](skills/specdev-room/SKILL.md).

## First use

1. Select a DSH workspace at a Git repository root. Existing `docs/specdev` projects can be browsed directly. Otherwise agree business requirements with the AI and use specdev-business to register documents and workflows first.
2. In that project's chat, say:

> Use specdev-room to create a room for this business.

The Skill guides business, style and arrangement choices, reads the current catalog, writes only `docs/specdev/<businessId>/room.json` and invokes the read-only validator. It does not generate models, business documents, new workflows or choose a default project.

3. Open the sidebar entry, choose the project/business, enter the room, inspect the overview and read bound material while walking. Refresh after configuration changes.

The management UI only writes snapshot tags, without changing business files, branches or commits. Skills write project files only within your authorization.

## Breaking changes from 0.1.x

Current npm package: `@pioneer_zmc/dsh-workbench`. Plugin/sidebar ID: `specdev-workbench`. Client module: `@pioneer_zmc/dsh-workbench/client`. Pages/APIs use `/specdev-workbench`; data uses `docs/specdev`, six formal `specdev/*/1` schemas, SpecDev building formats and `specdev/` snapshot tags. Old archify-maker/archify-house skills become specdev-business/specdev-building, with specdev-room added.

Only the new root, formats and tags are read. There is no automatic migration or old URL/skill alias; old bookmarks are not guaranteed. Old files and tags remain intact. Agree migration separately for each old project; do not bulk rename. Registered material can retain its original repository path.

## Limits and verification

The new npm identity candidate still requires this task’s isolated loading check, independent review and publication. Its identity changes are not covered by the old GitHub package byte-equivalence claim; the remaining implementation reuses existing evidence.

No in-page furniture editing/saving, arbitrary scaling, wall placement, nested supports, jumping/stairs in independent rooms, cross-room links or sitting/sleeping animation. Floor placement and one level of tabletop support are supported; style is a soft recommendation. The CLI checks configuration, placement, bindings and registered material reading. Workflow checks stop at JSON syntax and do not prove diagram compilation/rendering.

The 0.2.1 candidate was verified on Windows / DSH Desktop 0.2.0-rc.2 for the central entry, project ownership, room reading, internal navigation and chat draft retention. The three skills were confirmed discoverable with readable bodies and references through the host’s normal viewer. The final release package changes only the READMEs; runtime files match that tested candidate, and the final package was not reinstalled. Existing Web installation/use evidence covers 0.2.0 on Windows / DSH 0.1.6-alpha.2. The 0.2.1 source entry passed its 12 relevant regression checks; a separate isolated newer Web host check covered 0.2.0-rc.2. This does not claim installation of the final 0.2.1 package on every Web host. Other platforms and later host versions are unverified. A separate DSH_HOME isolates plugin/business data; Electron preferences, caches, single-instance behavior and protocol registration may still be shared within the account.

## Build and sample

Node.js ≥22. From this repository root, run sequentially:

~~~sh
npm install
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
npm pack --pack-destination .
~~~

Produces `pioneer_zmc-dsh-workbench-0.2.1.tgz`. The renderer and read-only validators are bundled; no private research repository is needed.

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

The target must not exist. See [sample/README.md](sample/README.md), then open the generated directory as a DSH workspace. Optional checks `node scripts/smoke.mjs` and `node scripts/check-save.mjs` run serially in generated samples without using your business project.

## License and acknowledgments

Plugin code, twelve self-created furniture models, generated textures and rendered thumbnails use [MIT](LICENSE). See [furniture sources](web/assets/furniture/SOURCES.md). Bundled [Archify license](vendor/archify-renderer/archify/LICENSE), [third-party notices](vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md) and [Three.js provenance](web/assets/three/VERSION.md) retain upstream attribution. Thanks to DSH and the upstream projects.
