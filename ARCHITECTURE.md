# Architecture

## Processes and trust

`electron/main.cjs` owns windows, native dialogs, SQLite reads, settings, cleanup, recovery, exports, and OS actions. The preload exposes a fixed method allowlist, typed window commands, and a removable event subscription. Each IPC call verifies the sender and main frame; operation payloads are checked with Zod. The renderer has sandboxing and context isolation enabled, no Node integration, no popup permission, and no granted browser permissions. Its CSP limits scripts and resources to the application and explicitly scoped local media.

Scan roots are capabilities: they must have been chosen through the native folder picker or exist in recorded scan history. Renderer-supplied file paths cannot directly invoke preview, cleanup, opening, or reveal operations. Those accept database file IDs and revalidate the corresponding record. Opening files uses a separate Windows confirmation because registered file handlers may execute code.

`hunter://preview/<random-token>` resolves short-lived, bounded tokens to database IDs. It verifies the file is still present and unchanged and checks the path for links. It streams through Electron's local file fetch, retaining Range support for video. No arbitrary URL or raw path is accepted by that protocol.

## Scan pipeline

The worker in `scan-worker.cjs` owns its SQLite connection and executes `scanner.cjs`. The WAL database allows the main process to read history while scanning. Directory work is queued in a SQLite temporary table; file discovery is inserted in transactions of up to 128 records. A physical `(device, inode)` index prevents linked directory entries from inflating scanned bytes. Candidate reads are paginated; concurrent reads are bounded from one to eight.

The pipeline is size grouping → partial SHA-256 fingerprints sampled at the beginning, middle, and end → streaming full SHA-256 → streaming byte comparison against a representative. Hashes are candidate filters, not sufficient proof. Group members pass a byte comparison. Metadata and opened-handle identity are compared before and after reads. The stream buffer is 256 KB per reader. Cancellation and pause are checked between directory entries and chunks; pending readers settle before the worker closes its database.

All identity reads use bigint filesystem stats. Device and inode identifiers and nanosecond timestamps are persisted as exact decimal strings, avoiding Windows 64-bit file IDs rounding through JavaScript numbers. Millisecond timestamps and logical sizes are converted to numbers only for supported-size calculations and display. Scan-worker writes use SQLite NORMAL synchronization because read-only scan results can be rebuilt; the main connection retains FULL synchronization for cleanup journals.

Image similarity uses Sharp for bounded local decoding and rotation-aware 9×8 grayscale images, producing 64-bit difference hashes. A metric tree searches within a Hamming distance derived from the chosen threshold. Fingerprints, dimensions, and approximate pairs are persisted separately. Exact-group pairs are omitted from the approximate results. Native decoder failures and configured limits are recorded as issues.

File lists are paginated: 30 groups per backend page, at most 1,000 displayed members per group, and 50 rendered rows per expanded group page. Cleanup accepts at most 1,000 distinct file IDs from one scan. Image pages contain at most 24 pairs. These bounds prevent rendering an entire large scan in the DOM. Groups larger than the display limit explicitly instruct users to narrow their scan.

## Persistence and recovery

`database.cjs` creates the schema and indexes. Settings, scans, file snapshots, approximate pairs, issues, and operations persist locally under Electron's user-data directory in `hunter.sqlite`. Startup marks unfinished scans interrupted and reconciles prepared quarantine operations. Historical totals at scan completion remain stored; current duplicate totals are recomputed from remaining present files.

Cleanup first checks protected paths, the selected file identities and checksums, and a surviving byte-identical copy outside the selection. It repeats checks immediately before every mutation. Hard links, Windows installation folders, Program Files, ProgramData, and custom protected folders cannot enter cleanup. The native confirmation defaults to cancel. There is no permanent-delete API.

Quarantine stays beside each original on the same filesystem, avoiding an unsafe copy/delete fallback. Recovery verifies the quarantined SHA-256, uses `link()` to install the original path without overwriting anything, then removes the quarantine name. An existing original path always blocks recovery. Restoring changes filesystem metadata, so the snapshot record is excluded until a new scan. If journal updates or filesystem operations fail, the recorded outcome remains reviewable.

Exports stream paginated rows into a temporary file, flush it, and rename it into the user-selected destination. CSV cells are quoted and spreadsheet formula-leading characters are neutralized. Exported reports contain private paths and should be shared deliberately.

## Practical boundaries

Filesystem snapshots are not locks. A malicious local process can still race path-based Windows filesystem operations after validation. This build does not claim to eliminate every TOCTOU attack or inspect every Windows reparse-tag subtype. Do not clean directories actively being rewritten by another program. Network filesystems may provide weaker identity, timestamps, atomicity, or Recycle Bin behavior; failures stop cleanup without permanent-deletion fallback.

Paused or cancelled I/O cannot interrupt a single blocked operating-system call. Very large single image decodes can consume significant native memory despite the pixel limit. The performance caps, paging, and streamed hashing are implemented; million-entry, low-memory, network-disconnect, and multi-terabyte performance certification still require target hardware testing.

Windows hidden/system attributes, allocation-level sparse/compressed savings, and video perceptual matching are not implemented. Reported bytes are logical file sizes. Quarantine and Recycle Bin contents still consume space. Exact matching deliberately excludes hard-linked files rather than estimating savings that may not exist.
