# DaemonCore: Duplicate Hunter

A local Windows desktop application for finding exact duplicates, reviewing visually similar images, and moving selected copies through a recorded cleanup workflow. Built with Electron 44, React 19, TypeScript, Vite, Tailwind CSS 4, Node worker threads, and SQLite.

The DaemonCore logo overlays the top-left navigation with genuine transparency, including the gaps between its shapes. The opaque original is preserved unchanged; `public/daemoncore-logo-transparent.png` is the cutout used by the app and Windows assets. See [LOGO-ASSET.md](LOGO-ASSET.md) for its edit specification.

## Run

Use Node.js 24.11 or newer on Windows:

```powershell
npm ci
npm run icons
npm run build
npm start
```

For development, use `npm run dev`. `Ctrl+1`, `Ctrl+2`, and `Ctrl+3` open Dashboard, Scan Center, and Duplicate Explorer. Escape closes media and issue dialogs. Window controls minimize, maximize/restore, and close the frameless desktop window.

Version 0.3.2 adds a one-click, opt-in exclusion for the common folder behind a filtered diagnostic type, when all matching paths share a folder within the scanned root. Version 0.3.1 made diagnostics filterable, paged, selectable, and actionable: copy paths, reveal files, or exclude selected files/folders from future scans. Repeated events are summarized by type so the total no longer reads as a list of cleanup work. The Windows taskbar icon now uses the central emblem without the small wordmark.

Version 0.3 adds space-goal cleanup missions, preferred keep folders that can be taught from file inspection, rapid photo burst review, and a richer graphite-and-crimson dashboard. A mission fills a review queue from up to the 30 largest exact duplicate groups in the selected scan; the estimate counts eligible copies only. Every move still needs review and confirmation. Burst groups contain at least three analyzed photos in one folder taken within 90 seconds, with up to 5,000 photos considered. They remain review-only and recommend the largest image dimensions as a comparison cue, not an automatic choice.

Version 0.2 adds focused scan presets, up to 20 named scan profiles, category/size/copy-count/cross-folder filters, page-wide suggested selection, a live file inspector, an image reveal-overlay comparison with zoom, clickable storage hotspots, a real scan-history chart, and a `Ctrl+K` command palette. Saved profiles retain folders and options locally; they do not schedule scans or delete files. The inspector distinguishes current, changed, missing, and inaccessible files against the recorded snapshot. Protected files are marked in results and excluded from suggested selection.

The scan console shows the actual phase, active path, candidate counts, average phase pace, elapsed time, and issues. Any remaining-time estimate applies only to the current known-total phase. Discovery has no invented completion percentage.

## Scan and review

1. Open Scan Center and choose one or more folders or drive roots. Windows folder selection also supports accessible UNC shares.
2. Set file size and extension filters. Add exclusions, protected folders, and preferred keep locations in Settings. Save preferences to retain them between launches.
3. Start the scan. Discovery, partial fingerprints, SHA-256 hashing, and streamed byte comparison run in a worker. Pause, resume, and cancel work between filesystem operations and read chunks. Permission and changed-file issues remain available for review.
4. Expand exact groups in Duplicate Explorer, inspect paths and timestamps, compare media, and select copies. Keep recommendations explain the selected preference and never identify an original as a fact.
5. Open Cleanup Center, run the dry-run validation, and review the native Windows confirmation. The backend repeats validation before moving any file. At least one live, verified copy per group must remain.

Hard-linked entries represent shared physical storage and are excluded from duplicate cleanup savings. Symbolic links and junctions are skipped. Dot-prefixed file inclusion is configurable; Windows hidden/system attributes are not currently used as a filter. Quarantine folders and the app's own data directory are excluded automatically.

Similarity scanning is optional. It decodes images locally, computes 64-bit difference hashes, and compares fingerprints through a metric tree. Approximate image matches are kept out of cleanup. The current bounds are 20,000 indexed images, 100,000 pairs, and 80 million input pixels per image; limits and decoder failures appear as scan issues. Animated images and multi-page files use the first frame/page. A fingerprint score is not a probability or guarantee of identical content.

Exact video matching uses the same byte-verification engine as other files. Inline playback depends on Chromium codec support. Frame-sampled near-duplicate video matching is explicitly unavailable.

## Cleanup and recovery

- **Recycle Bin (default):** uses Electron's Windows trash operation, with no permanent-deletion fallback. Restore recycled files through Windows. Emptying the Bin is a separate user decision.
- **Quarantine:** atomically renames each selected file into `.DaemonCore-Quarantine/<operation-id>/` beside the original. Files remain on their source volume. Recovery verifies checksums and refuses to overwrite an existing path. Quarantine does **not** free disk space. The initial restore implementation requires hard-link support for its atomic no-overwrite installation; use Explorer to move files manually on filesystems that do not support it.
- Every attempted move gets a durable SQLite journal entry before mutation. Interrupted or ambiguous outcomes are marked for review. On startup, prepared quarantine operations are reconciled against the filesystem.
- Restored files require a fresh scan before they can be selected for another cleanup. Clearing scan history preserves every scan referenced by an operation journal.

## Checks and packaging

```powershell
npm run format:check
npm run check
npm run smoke
npm run startup:check
npm run package:win
npm run package:store
npm run verify:store
```

Filesystem tests need normal Windows filesystem permissions; restricted sandboxes may deny hard links, junctions, or renames. The smoke command creates disposable fixtures and an isolated app profile, exercises the actual Electron worker, IPC, preview protocol, page navigation, and cleanup dry run, and writes its result and screenshot to `artifacts/`. It never scans or cleans user folders.

Close other running instances before `npm run startup:check`. That check uses the normal persistent profile and must render a fresh Dashboard; an already-running instance is reported as a blocked test rather than a successful launch.

Installers and Store packages are written to `release/`. `package:win` builds an NSIS installer; `package:store` builds an AppX package. These commands do not publish anything. The Microsoft identity is configured from the supplied Partner Center screenshot:

| Field                  | Value                                   |
| ---------------------- | --------------------------------------- |
| Display name           | DaemonCore: Duplicate Hunter            |
| Package identity       | DaemonCore.DaemonCoreDuplicateHunter    |
| Publisher              | CN=B7B53B09-651D-4171-90BE-4E9E1F5738BA |
| Publisher display name | DaemonCore                              |
| Store ID               | 9NS89BZQKWT4                            |

The executable basename omits the colon because Windows filenames cannot contain it. The app, window title, and Store display name retain it.

This build has not passed Microsoft Store certification. See [RELEASE-READINESS.md](RELEASE-READINESS.md) for the remaining distribution checks, [ARCHITECTURE.md](ARCHITECTURE.md) for the implementation and threat boundaries, and [THIRD-PARTY.md](THIRD-PARTY.md) for redistribution considerations.

Version 0.1.1 fixes normal Windows startup by keeping the persistent profile at `%APPDATA%/daemoncore-duplicate-hunter`. The display name retains its colon; filesystem paths do not inherit it. `startup:check` exercises this real profile and renderer startup, while `smoke` exercises disposable scan fixtures in a separate profile.
