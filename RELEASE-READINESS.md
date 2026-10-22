# Release readiness

This is a working Windows application build. It is not represented as Microsoft Store certified or as having completed all commercial release validation.

## Implemented

- Supplied branding and Partner Center package/publisher identity.
- Sandboxed Electron renderer, validated IPC, scoped media previews, native dialogs.
- Worker scanning with bounded reads, SQLite-backed directory queue and persisted history.
- Size → partial fingerprint → SHA-256 → byte comparison for exact groups.
- Pause/resume/cancel, extension and size filters, exclusions, inaccessible/changed-file issue handling.
- Local image perceptual matching with explicit resource limits; approximate results cannot enter cleanup.
- Exact video matching and browser-supported playback. Near-duplicate video matching is clearly unavailable.
- Keep recommendations, protected folders, dry-run validation, native confirmation, and keep-one-copy safeguards.
- Recycle Bin operations without permanent-delete fallback; recorded same-volume quarantine and checksum-verified restoration without overwrite.
- Storage/extension/directory/drive/size breakdowns, scan comparisons, CSV and JSON exports.
- NSIS and AppX build configurations; dependency notices bundled in packages.

## Automated verification

Run `npm run format:check`, `npm run check`, and `npm run smoke`. The Node suite covers hashing, exact grouping, streaming large files, Unicode, changed files, links/junctions, cancellation, filters, keep-one-copy rules, protected folders, quarantine, overwrite refusal, restoration, failed Recycle Bin operations, interrupted quarantine, settings, and real image decoding. Electron smoke checks exercise the real worker, SQLite, IPC validation, all navigation pages, selection and dry-run controls, scoped previews, and renderer sandboxing.

These checks are evidence for the covered cases, not a substitute for the release checks below.

Local verification on October 21, 2026: all 23 Node regression tests passed, as did linting, TypeScript, the Vite production build, and the Electron integration checks. The 10,000-file worker benchmark found the expected 5,000 groups and 40,960,000 indexed bytes with zero issues in 49,557 ms; peak process RSS was 108,478,464 bytes. Fixtures were 4 KB files in duplicate pairs, created in a disposable local directory. Fixture creation is outside the scan timing. This is one measured workload, not a million-file or large-video performance claim. Repeat it with `npm run benchmark -- 10000`.

## Before sale or Store submission

Version 0.1.1 repairs a normal-startup failure in 0.1.0: Electron inherited the display name's colon when creating its default Windows profile. The app now assigns stable, valid user-data, session-data, and log paths before requesting the single-instance lock. A normal-profile startup check is included in Windows CI so isolated smoke profiles cannot hide this regression.

1. Complete the Windows App Certification Kit and Partner Center certification on the exact package to be submitted. Verify final manifest identity, capabilities, display assets, supported Windows versions, and package signing/install trust.
2. Validate installation, upgrade, uninstall, persisted user-data behavior, and restoration on clean Windows 10 and Windows 11 machines. The local installer is unsigned unless a publisher certificate is provided at build time.
3. Perform accessibility testing with Narrator, keyboard-only use, high contrast, high DPI, and multiple monitors. Check focus behavior, reduced motion, contrast, and screen reader announcements on the packaged build.
4. Benchmark large real trees, million-entry scans, huge duplicate groups, multi-terabyte files, low-memory machines, removable volumes, and slow/disconnected UNC shares. Test locked and inaccessible content under normal user permissions.
5. Exercise actual Recycle Bin behavior on each supported filesystem and share type. Validate power loss and process termination at journal boundaries, and recovery on removable/network storage. Quarantine restoration currently requires hard-link support; manual restoration remains possible where it is unavailable.
6. Review filesystem race boundaries documented in `ARCHITECTURE.md`. Do not claim path-based validation fully prevents interference by another malicious process with filesystem access.
7. Complete the native codec/library redistribution review described in `THIRD-PARTY.md`, including exact corresponding sources and required license texts or offers. The inventory generation step does not itself complete that audit.
8. Add support contact, final EULA, Store privacy URL, pricing, product screenshots, age rating, and Store listing copy using the publisher's actual information. No contact details or certification activity have been invented.

No Store submission, certification, signing certificate purchase, listing publication, or paid service activation is performed by the build scripts.
