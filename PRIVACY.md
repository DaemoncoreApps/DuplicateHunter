# Privacy

DaemonCore: Duplicate Hunter analyzes files on your computer. It does not require an account and does not upload filenames, paths, hashes, metadata, images, videos, file contents, or scan results. No advertising, analytics, telemetry, or subscription service is configured.

The app stores selected roots, file snapshots, SHA-256 and image fingerprints, settings, scan issues, and cleanup/recovery journals in a SQLite database in its local Electron user-data directory. These records may contain sensitive file paths. Quarantine files remain beside their original folders. Reports are written only to a location chosen through the native Save dialog and can include full paths.

Clearing unused scan history removes scans that have no cleanup journal references. Journals and their referenced scans are preserved to avoid losing recovery information. Uninstall is configured to retain app data. Windows manages Recycle Bin contents separately.

Choosing a network share accesses that network location. Opening a file with Windows invokes its registered application, whose behavior is outside this app's control. Windows, cloud placeholder providers, and Microsoft Store distribution may make their own network requests. The application itself has no remote file-analysis service or built-in updater.
