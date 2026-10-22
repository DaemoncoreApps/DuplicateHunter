# Third-party components

The application is proprietary. Its dependencies retain their own licenses. `npm run notices` collects the installed runtime packages' license files, attribution, repository references, versions, and the Electron/Chromium notices into `build/notices`. Packaging includes these under `resources/notices`; Electron's own distribution notices are also retained.

React and React DOM use the MIT license; Lucide uses ISC; Zod uses MIT; Sharp uses Apache-2.0. The Windows Sharp binary also contains libraries under LGPL and other licenses. Its bundled README and versions manifest list those components. These are not covered by the app's proprietary license.

The unmodified Sharp native modules and dynamically loaded libvips DLLs remain outside the ASAR archive in `resources/app.asar.unpacked/node_modules/@img/sharp-win32-x64/lib`. They must remain replaceable when distributing the app. Do not remove dependency notices, prohibit debugging changes to LGPL components, or claim ownership of those components.

Source and build references:

- Sharp: <https://github.com/lovell/sharp> (version is recorded in `packages.json`).
- Native libraries and build recipes: <https://github.com/lovell/sharp-libvips>. The native binary's bundled `versions.json` identifies the library versions; its README identifies upstream libraries and licenses.
- Electron: <https://github.com/electron/electron> (44.7.2); Chromium notices are included in full.

Before commercial distribution, verify that the exact shipped native binaries' corresponding source, third-party license texts, and any required source offer are available under their applicable terms. The generated attribution inventory is not a completed redistribution audit. Do not remove this release gate simply because dependency vulnerability checks pass.
