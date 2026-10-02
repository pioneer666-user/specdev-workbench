# SpecDev Workbench 0.2.1

English | [简体中文](README.zh.md)

Choose a DSH project, read business documents and workflows, or ask a bundled Skill to arrange an independent room for one business.

## Download and install

### Windows Desktop

Use the CLI bundled with your Desktop installation, not the global Web CLI. Save your work, exit Desktop from its menu or tray, and confirm its background instance has ended. Download the tgz to a local path without spaces.

The following example uses a **custom data root**. Replace the installation and package paths; CLI and Desktop must use the same DSH_HOME. Existing users must keep their actual root. If DSH_HOME was previously unset, leave it unset rather than changing roots to install. This variable affects only the current terminal and its child processes, not system settings.

~~~powershell
$DesktopDir = 'C:\Apps\DSH' # Replace with your Desktop installation directory
$Package = 'C:\DSHPackages\specdev-dsh-workbench-0.2.1.tgz'
$env:DSH_HOME = 'C:\DSHData\desktop' # Custom-root example only; match your actual Desktop root
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add $Package
& "$DesktopDir\DeepSeek Harness.exe"
~~~

For an upgrade, remove only a package actually installed before add: use this same bundled CLI with 'plugin --profile desktop remove @specdev/dsh-workbench' for the current identity, or '@specdev/dsh-archify-manage' for 0.1.11 and earlier. Do not remove absent packages or clear the data root. Restart Desktop from the same environment; a normal shortcut may not inherit the terminal's custom root.

The Desktop sidebar opens SpecDev Workbench in the central panel. Choose a project, then use Return to chat to restore the original conversation.

### Web

Existing Web hosts continue using their terminal command and original data root:

~~~sh
dsh plugin --profile web add https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.1/specdev-dsh-workbench-0.2.1.tgz
~~~

For an upgrade, stop the corresponding Web instance and remove only the installed identity using 'dsh plugin --profile web remove @specdev/dsh-workbench' (or '@specdev/dsh-archify-manage' for the old identity), then add and restart. Do not use Web commands for Desktop profiles.

The Web sidebar entry opens a new tab listing project names and full paths while preserving the chat. Create a workspace in DSH and refresh an empty list; retry failed reads. Both states retain manual configuration.

[Download 0.2.1](https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.1/specdev-dsh-workbench-0.2.1.tgz) · [Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.1)

The 0.2.1 URLs become available after publication; before that they are preparation addresses. Published 0.2.0 remains at its [original Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.0).

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

New package: `@specdev/dsh-workbench`. Plugin/sidebar ID: `specdev-workbench`. Client module: `@specdev/dsh-workbench/client`. Pages/APIs use `/specdev-workbench`; data uses `docs/specdev`, six formal `specdev/*/1` schemas, SpecDev building formats and `specdev/` snapshot tags. Old archify-maker/archify-house skills become specdev-business/specdev-building, with specdev-room added.

Only the new root, formats and tags are read. There is no automatic migration or old URL/skill alias; old bookmarks are not guaranteed. Old files and tags remain intact. Agree migration separately for each old project; do not bulk rename. Registered material can retain its original repository path.

## Limits and verification

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

Produces `specdev-dsh-workbench-0.2.1.tgz`. The renderer and read-only validators are bundled; no private research repository is needed.

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

The target must not exist. See [sample/README.md](sample/README.md), then open the generated directory as a DSH workspace. Optional checks `node scripts/smoke.mjs` and `node scripts/check-save.mjs` run serially in generated samples without using your business project.

## License and acknowledgments

Plugin code, twelve self-created furniture models, generated textures and rendered thumbnails use [MIT](LICENSE). See [furniture sources](web/assets/furniture/SOURCES.md). Bundled [Archify license](vendor/archify-renderer/archify/LICENSE), [third-party notices](vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md) and [Three.js provenance](web/assets/three/VERSION.md) retain upstream attribution. Thanks to DSH and the upstream projects.
