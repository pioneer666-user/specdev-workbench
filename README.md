# SpecDev Workbench 0.2.0

English | [简体中文](README.zh.md)

Choose a DSH project, read business documents and workflows, or ask a bundled Skill to arrange an independent room for one business.

## Download and install

Requires DSH and `dsh`, `pnpm` and `git` in your terminal. Verified environment: Windows, DSH 0.1.6-alpha.2, web profile. Other platforms and host versions are unverified.

~~~sh
dsh plugin --profile web add https://github.com/pioneer666-user/dsh-archify-manage/releases/download/v0.2.0/specdev-dsh-workbench-0.2.0.tgz
~~~

[Download 0.2.0](https://github.com/pioneer666-user/dsh-archify-manage/releases/download/v0.2.0/specdev-dsh-workbench-0.2.0.tgz) · [Release](https://github.com/pioneer666-user/dsh-archify-manage/releases/tag/v0.2.0)

Restart DSH and click “SpecDev 工作台 ↗” in the sidebar. A new tab lists workspace names and full paths; selecting one opens that project's home in the same tab and preserves the original chat. For an empty list, create a workspace in DSH and refresh. Failed requests can be retried; empty and error states retain a manual configuration entry.

### Upgrade an existing installation

Finish active tasks and stop DSH. Remove only packages actually installed. If both identities are installed, remove both to avoid duplicate plugins.

~~~sh
# Old released package (0.1.11 and earlier)
dsh plugin --profile web remove @specdev/dsh-archify-manage
# Development package (only if installed)
dsh plugin --profile web remove @specdev/dsh-workbench
# Install the single new package, then restart DSH
dsh plugin --profile web add https://github.com/pioneer666-user/dsh-archify-manage/releases/download/v0.2.0/specdev-dsh-workbench-0.2.0.tgz
~~~

Sessions and business repository data are retained. For local tgz installation, use a path without spaces.

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

The author has verified project selection, room creation, document and workflow reading in real DSH use. Technical coverage is limited to the declared host and fixed package; other platforms and latest DSH versions are not claimed as verified.

## Build and sample

Node.js ≥22. From this repository root, run sequentially:

~~~sh
npm install
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
npm pack --pack-destination .
~~~

Produces `specdev-dsh-workbench-0.2.0.tgz`. The renderer and read-only validators are bundled; no private research repository is needed.

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

The target must not exist. See [sample/README.md](sample/README.md), then open the generated directory as a DSH workspace. Optional checks `node scripts/smoke.mjs` and `node scripts/check-save.mjs` run serially in generated samples without using your business project.

## License and acknowledgments

Plugin code, twelve self-created furniture models, generated textures and rendered thumbnails use [MIT](LICENSE). See [furniture sources](web/assets/furniture/SOURCES.md). Bundled [Archify license](vendor/archify-renderer/archify/LICENSE), [third-party notices](vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md) and [Three.js provenance](web/assets/three/VERSION.md) retain upstream attribution. Thanks to DSH and the upstream projects.
