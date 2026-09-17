# Contributing to Gargantua

Thank you for helping improve Gargantua. This guide describes the expected local workflow and the boundaries that keep the simulator reusable, offline, and secure.

## Set up the project

Requirements:

- Node.js 22.12 or newer
- pnpm 10 or newer
- Git

```bash
git clone https://github.com/FanZhu1998/Black_Hole.git
cd Black_Hole
pnpm install --frozen-lockfile
pnpm dev
```

The first install downloads Electron and may take several minutes. Do not commit `node_modules/`, `dist/`, `out/`, test reports, or generated icons.

## Before making a change

1. Open an issue for a large feature or architecture change so the scope can be discussed first.
2. Keep changes focused. Renderer work, desktop-shell work, and user-interface work have different failure modes and are easier to review separately.
3. Preserve the offline runtime, renderer fallback, keyboard access, and reduced-motion behavior unless the change explicitly addresses one of them.

## Project conventions

- Use modern JavaScript modules in the renderer and CommonJS only for the Electron main process and preload files.
- Keep simulation state updates immutable and validated through `updateState`.
- Treat `createSimulator` as a public API. Avoid sharing mutable state between instances.
- Release every event listener, observer, animation frame, and GPU resource in `dispose()`.
- Keep platform operations behind the narrow `platformApi` interface.
- Keep Node.js APIs out of the renderer. The Electron window must retain sandboxing, context isolation, and disabled Node integration.
- Do not add remote fonts, analytics, CDNs, or runtime network dependencies.
- Use semantic HTML, visible focus styles, useful accessible names, and keyboard equivalents for core actions.
- Edit files in `src/`; never edit generated files in `dist/` or `assets/generated/`.

## Test changes

Run the smallest relevant check while developing, then run the full suite before submitting:

```bash
pnpm test
pnpm test:browser
pnpm test:electron
pnpm check
```

Choose the test layer that matches the behavior:

| Change | Expected coverage |
| --- | --- |
| State validation or quality policy | Node unit test in `test/unit/` |
| Controls, accessibility, responsive layout, fallback, or reusable module | Browser test in `test/browser/` |
| Preload bridge, navigation, CSP, storage, or window behavior | Electron test in `test/electron/` |
| Shader or visual rendering | Browser smoke test plus a manual check on representative GPU hardware |

For manual review, verify:

- All four presets render and stay synchronized with the controls.
- Drag, scroll, arrow-key, and zoom-key input works.
- Pausing stops disk motion and retains interactive camera controls.
- PNG save and clipboard copy complete without freezing the renderer.
- Performance, Balanced, Cinematic, and Auto quality can be selected.
- A narrow window has no horizontal overflow.
- Reduced-motion mode starts paused.
- The simplified renderer remains usable when WebGL 2 is unavailable.

## Work on shaders

Shader sources live in `src/rendering/shaders/`. `scripts/build.mjs` converts the GLSL files into JavaScript string modules for the generated renderer and library trees. Run `pnpm build` after every shader change and test through the built output.

Keep shader loops bounded and avoid features unavailable in WebGL 2. Check both HDR and RGBA8 framebuffer paths, because `EXT_color_buffer_float` is optional.

## Work on desktop packaging

Run these commands on the operating system being targeted:

```bash
pnpm package
pnpm make
```

`pnpm package` creates an unpacked application. `pnpm make` invokes the configured installers and archives. Neither command publishes a release.

Changes to Electron privileges, the preload bridge, Content Security Policy, custom protocol, IPC validation, network blocking, or fuses require an Electron test and a short explanation in the pull request.

## Submit a pull request

Include:

- The user-visible problem and resulting behavior
- Screenshots or a short capture for visual changes
- The commands you ran and their results
- GPU, operating-system, or packaging limitations a reviewer should know

Before requesting review:

- [ ] `pnpm check` passes, or the pull request explains a host-specific limitation
- [ ] Generated output and local settings are absent from the diff
- [ ] New controls have accessible names and keyboard behavior
- [ ] New public API behavior is documented in `README.md`
- [ ] Security boundaries remain covered by tests

By contributing, you agree that your contribution is licensed under the project's MIT License.
