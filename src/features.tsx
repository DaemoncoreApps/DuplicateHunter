import React, { useState } from "react";
import {
  ScanLine,
  Images,
  Film,
  FileText,
  FolderOpen,
  Bookmark,
  ArrowUpRight,
  ArrowRight,
  Search,
  SlidersHorizontal,
  X,
  ShieldCheck,
  Copy,
  Check,
  Command,
  ChevronRight,
  Layers,
  HardDrive,
  Activity,
  Pause,
  Play,
  Square,
  ZoomIn,
  Target,
  Sparkles,
  Camera,
  Clock3,
} from "lucide-react";
import { Button, MediaThumb } from "./components";
import { bytes, date, basename, duration } from "./format";

export const defaultFilters = {
  category: "all",
  minSize: 0,
  maxSize: 0,
  minCopies: 2,
  crossFolders: false,
  directory: "",
};
export type ExplorerFilters = typeof defaultFilters;

export function CleanupMission({
  groups,
  onBuild,
}: {
  groups: any[];
  onBuild: (files: Map<number, any>, saved: number, target: number) => void;
}) {
  const [targetMb, setTargetMb] = useState(1024);
  const eligible = groups
    .map((group) =>
      group.files.filter(
        (file: any) =>
          file.id !== group.keep.id && file.nlink === 1 && !file.protected,
      ),
    )
    .flat();
  const saved = eligible.reduce((sum: number, file: any) => sum + file.size, 0);
  const target = targetMb * 1024 * 1024;
  const plan = new Map<number, any>();
  let projected = 0;
  for (const group of groups) {
    const copies = group.files.filter(
      (file: any) =>
        file.id !== group.keep.id && file.nlink === 1 && !file.protected,
    );
    for (const file of copies) {
      if (projected >= target || plan.size >= 1000) break;
      plan.set(file.id, file);
      projected += file.size;
    }
    if (projected >= target || plan.size >= 1000) break;
  }
  const count = new Set(
    groups
      .filter((group) => group.files.some((file: any) => plan.has(file.id)))
      .map((group) => group.group_id),
  ).size;
  return (
    <section className="mission-panel">
      <div className="mission-copy">
        <span className="eyebrow">
          <Sparkles size={13} /> PERSONAL CLEANUP PLAN
        </span>
        <h2>Make room for what’s next.</h2>
        <p>Set a goal. Review verified copies selected to reach it.</p>
      </div>
      <div className="mission-controls">
        <label>
          SPACE GOAL
          <select
            aria-label="Cleanup mission space goal"
            value={targetMb}
            onChange={(event) => setTargetMb(Number(event.target.value))}
          >
            <option value={100}>100 MB</option>
            <option value={250}>250 MB</option>
            <option value={500}>500 MB</option>
            <option value={1024}>1 GB</option>
            <option value={5120}>5 GB</option>
            <option value={10240}>10 GB</option>
          </select>
        </label>
        <div className="mission-projection">
          <strong>{bytes(projected)}</strong>
          <span>
            planned from {count} duplicate {count === 1 ? "group" : "groups"}
          </span>
        </div>
        <Button
          kind="primary"
          disabled={!plan.size}
          onClick={() => onBuild(plan, projected, target)}
        >
          <Target size={15} /> Build review plan <ArrowRight size={15} />
        </Button>
      </div>
      <div
        className="mission-meter"
        aria-label={`${bytes(saved)} eligible duplicate copies`}
      >
        <span
          style={{ width: `${Math.min(100, (100 * projected) / target)}%` }}
        />
      </div>
      <small className="mission-note">
        {saved
          ? `${bytes(saved)} available in the 30 largest groups on this scan. Exact copies only; you approve every move.`
          : "Run a duplicate scan to build a real cleanup plan. No files move until you review and confirm."}
      </small>
    </section>
  );
}

export function BurstReview({
  data,
  scanImages,
  onCompare,
}: {
  data: any;
  scanImages: boolean;
  onCompare: (files: any[]) => void;
}) {
  if (!scanImages)
    return (
      <section className="burst-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">PHOTO INTELLIGENCE</span>
            <h2>Rapid photo bursts</h2>
          </div>
          <Camera size={20} />
        </div>
        <p className="muted">
          Enable image analysis in a photo scan to find nearby shots from the
          same folder.
        </p>
      </section>
    );
  return (
    <section className="burst-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">
            <Camera size={13} /> MOMENT DETECTION
          </span>
          <h2>Rapid photo bursts</h2>
        </div>
        <span className="burst-count">{data.bursts.length} sequences</span>
      </div>
      <p className="muted">
        Photos from the same folder taken within 90 seconds, ranked by image
        dimensions. Similar shots stay review-only.
      </p>
      {data.truncated && (
        <div className="notice compact">
          Showing bursts from the first 5,000 analyzed photos.
        </div>
      )}
      {data.bursts.length ? (
        <div className="burst-list">
          {data.bursts.slice(0, 8).map((burst: any, index: number) => (
            <article
              className="burst-card"
              key={`${burst.directory}-${burst.started}-${index}`}
            >
              <div className="burst-heading">
                <span>
                  <Clock3 size={13} />{" "}
                  {date(new Date(burst.started).toISOString())}
                </span>
                <strong>{burst.files.length} nearby shots</strong>
              </div>
              <div className="burst-photos">
                {burst.files.slice(0, 5).map((file: any) => (
                  <div
                    className={
                      file.id === burst.largest.id
                        ? "burst-photo recommended"
                        : "burst-photo"
                    }
                    key={file.id}
                  >
                    <MediaThumb file={file} />
                    <span title={basename(file.path)}>
                      {basename(file.path)}
                    </span>
                    <small>
                      {file.width} × {file.height}
                    </small>
                    {file.id === burst.largest.id && <b>Largest dimensions</b>}
                  </div>
                ))}
              </div>
              <div className="burst-footer">
                <span title={burst.directory}>{burst.directory}</span>
                <Button onClick={() => onCompare(burst.files.slice(0, 4))}>
                  <Images size={14} /> Compare shots
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="burst-empty">
          <Camera size={26} />
          <strong>No rapid sequences in this scan</strong>
          <span>
            We’ll surface groups of three or more photos from one folder taken
            within 90 seconds.
          </span>
        </div>
      )}
    </section>
  );
}

const presets = [
  {
    id: "exact",
    name: "Deep duplicate hunt",
    description: "Every file type. Full content verification.",
    icon: ScanLine,
    options: { extensions: "", minSize: 1, maxSize: 0, scanImages: false },
  },
  {
    id: "images",
    name: "Photo library",
    description: "Exact copies plus visual image similarity.",
    icon: Images,
    options: {
      extensions: ".jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.avif",
      minSize: 1,
      maxSize: 0,
      scanImages: true,
    },
  },
  {
    id: "media",
    name: "Large media",
    description: "Audio and video copies over 50 MB.",
    icon: Film,
    options: {
      extensions: ".mp4,.mkv,.mov,.avi,.webm,.wmv,.m4v,.mp3,.wav,.flac,.m4a",
      minSize: 50 * 1048576,
      maxSize: 0,
      scanImages: false,
    },
  },
  {
    id: "documents",
    name: "Documents & archives",
    description: "Documents, downloads, and packed backups.",
    icon: FileText,
    options: {
      extensions:
        ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.7z,.rar",
      minSize: 1,
      maxSize: 0,
      scanImages: false,
    },
  },
];
export function ScanProfiles({
  profiles,
  roots,
  settings,
  disabled,
  onApply,
  onSave,
  onDelete,
}: {
  profiles: any[];
  roots: string[];
  settings: any;
  disabled: boolean;
  onApply: (options: any, roots?: string[]) => void;
  onSave: (name: string, id?: string) => Promise<{ id: string } | undefined>;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(""),
    [selected, setSelected] = useState("");
  return (
    <section className="scan-profiles">
      <div className="section-title">
        <div>
          <span className="eyebrow">YOUR HUNT, YOUR RULES</span>
          <h2>Start with a focused scan</h2>
        </div>
        <span className="quiet-label">
          <Bookmark size={13} /> Setups stay on this computer
        </span>
      </div>
      <div className="preset-grid">
        {presets.map((p) => (
          <button
            disabled={disabled}
            key={p.id}
            className={`preset-card ${selected === p.id ? "chosen" : ""}`}
            onClick={() => {
              setSelected(p.id);
              setName("");
              onApply({ ...settings, ...p.options });
            }}
          >
            <span className="preset-icon">
              <p.icon size={23} />
            </span>
            <strong>{p.name}</strong>
            <small>{p.description}</small>
            <span className="preset-tail">
              Apply setup <ArrowUpRight size={14} />
            </span>
          </button>
        ))}
      </div>
      <div className="saved-profile-strip">
        <Bookmark size={17} />
        <div className="saved-profile-list">
          {profiles.length ? (
            profiles.map((p) => (
              <div
                className={`saved-profile ${selected === p.id ? "selected" : ""}`}
                key={p.id}
              >
                <button
                  disabled={disabled}
                  onClick={() => {
                    setSelected(p.id);
                    setName(p.name);
                    onApply(p.options, p.roots);
                  }}
                  title={p.roots.join("\n")}
                >
                  <span>{p.name}</span>
                  <small>
                    {p.roots.length} location{p.roots.length === 1 ? "" : "s"}
                  </small>
                </button>
                <button
                  disabled={disabled}
                  title={`Delete saved setup ${p.name}`}
                  aria-label={`Delete saved setup ${p.name}`}
                  onClick={() => onDelete(p.id)}
                >
                  <X size={13} />
                </button>
              </div>
            ))
          ) : (
            <span className="muted">
              Save the folders and options you use most.
            </span>
          )}
        </div>
        <form
          className="save-profile-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim()) {
              const saved = await onSave(
                name.trim(),
                profiles.some((p) => p.id === selected) ? selected : undefined,
              );
              if (saved) setSelected(saved.id);
            }
          }}
        >
          <input
            aria-label="Scan profile name"
            placeholder="Name this setup…"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
          />
          <button
            className="button"
            type="submit"
            disabled={disabled || !roots.length || !name.trim()}
          >
            <Bookmark size={14} />{" "}
            {profiles.some((p) => p.id === selected)
              ? "Update setup"
              : "Save setup"}
          </button>
          {profiles.some((p) => p.id === selected) && (
            <button
              className="text-button"
              type="button"
              disabled={disabled}
              onClick={() => {
                setSelected("");
                setName("");
              }}
            >
              Save as new
            </button>
          )}
        </form>
      </div>
    </section>
  );
}
export function FilterPanel({
  value,
  onChange,
  total,
  savings,
  onSelect,
  disabled,
}: {
  value: ExplorerFilters;
  onChange: (v: ExplorerFilters) => void;
  total: number;
  savings: number;
  onSelect: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false),
    count = Object.entries(value).filter(
      ([k, v]) => v !== defaultFilters[k as keyof ExplorerFilters],
    ).length;
  const invalid = Boolean(value.maxSize && value.maxSize < value.minSize);
  return (
    <section className="filter-panel">
      <div className="filter-top">
        <div className="category-tabs" role="group" aria-label="File category">
          {[
            ["all", "All files"],
            ["images", "Images"],
            ["video", "Videos"],
            ["audio", "Audio"],
            ["documents", "Documents"],
            ["archives", "Archives"],
            ["other", "Other"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={value.category === key ? "active" : ""}
              onClick={() => onChange({ ...value, category: key })}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={`filter-toggle ${expanded ? "active" : ""}`}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={15} /> Filters {count > 0 && <b>{count}</b>}
        </button>
      </div>
      {expanded && (
        <div className="advanced-filters">
          <label>
            Minimum file size (MB)
            <input
              aria-label="Minimum result size in MB"
              type="number"
              min="0"
              step="0.1"
              value={value.minSize / 1048576}
              onChange={(e) =>
                onChange({
                  ...value,
                  minSize: Math.max(
                    0,
                    Math.round(Number(e.target.value) * 1048576),
                  ),
                })
              }
            />
          </label>
          <label>
            Maximum size (MB, 0 = any)
            <input
              type="number"
              min="0"
              step="0.1"
              value={value.maxSize / 1048576}
              onChange={(e) =>
                onChange({
                  ...value,
                  maxSize: Math.max(
                    0,
                    Math.round(Number(e.target.value) * 1048576),
                  ),
                })
              }
            />
          </label>
          <label>
            Minimum copies
            <select
              value={value.minCopies}
              onChange={(e) =>
                onChange({ ...value, minCopies: Number(e.target.value) })
              }
            >
              {[2, 3, 4, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n}+ copies
                </option>
              ))}
            </select>
          </label>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={value.crossFolders}
              onChange={(e) =>
                onChange({ ...value, crossFolders: e.target.checked })
              }
            />{" "}
            Copies across different folders
          </label>
        </div>
      )}
      {value.directory && (
        <div className="directory-filter">
          <FolderOpen size={14} />
          <span title={value.directory}>{value.directory}</span>
          <button
            aria-label="Clear directory filter"
            onClick={() => onChange({ ...value, directory: "" })}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {invalid && (
        <p className="filter-error" role="alert">
          Maximum size must be zero (unlimited) or at least the minimum size.
        </p>
      )}
      <div className="filter-summary">
        <span>
          <strong>{total.toLocaleString()}</strong> matching groups <i />{" "}
          <strong>{bytes(savings)}</strong> potential savings
        </span>
        <div>
          {count > 0 && (
            <button
              className="text-button"
              onClick={() => onChange({ ...defaultFilters })}
            >
              Reset filters
            </button>
          )}
          <Button onClick={onSelect} disabled={disabled || !total || invalid}>
            <Check size={14} /> Select suggested copies on this page
          </Button>
        </div>
      </div>
    </section>
  );
}
export function WorkspaceOverview({
  summary,
  history,
  onExplore,
  onHistory,
  onScan,
}: {
  summary: any;
  history: any[];
  onExplore: () => void;
  onHistory: () => void;
  onScan: () => void;
}) {
  const scans = [...history]
      .filter((h) => h.status === "complete")
      .slice(0, 12)
      .reverse(),
    max = Math.max(1, ...scans.map((h) => h.files));
  const points = scans
    .map(
      (h, i) =>
        `${20 + (i * 460) / Math.max(1, scans.length - 1)},${112 - (h.files / max) * 86}`,
    )
    .join(" ");
  const percent = summary?.bytes ? (100 * summary.savings) / summary.bytes : 0;
  return (
    <section className="workspace-overview">
      <div className="intelligence-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">FILE INTELLIGENCE</span>
            <h2>A clearer picture of your storage</h2>
          </div>
          <Activity size={20} />
        </div>
        <div className="intelligence-body">
          <div
            className="storage-orbit"
            style={
              {
                "--storage-angle": `${Math.min(100, percent) * 3.6}deg`,
              } as React.CSSProperties
            }
          >
            <div>
              <strong>
                {percent.toFixed(1)}
                <span>%</span>
              </strong>
              <small>potentially redundant</small>
            </div>
          </div>
          <div className="intelligence-readout">
            <strong>
              {summary
                ? `${(summary.groups_count || 0).toLocaleString()} ${summary.groups_count === 1 ? "group" : "groups"} worth a closer look`
                : "Your first scan starts the story"}
            </strong>
            <p>
              {summary
                ? `${bytes(summary.savings)} of ${bytes(summary.bytes)} indexed bytes are extra verified copies. Review them before taking action.`
                : "No estimates, invented savings, or background cleanup. Choose your locations and build a real storage picture."}
            </p>
            <Button onClick={summary ? onExplore : onScan}>
              {summary ? "Inspect duplicate groups" : "Choose scan locations"}{" "}
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
        <div className="assurance-strip">
          <span>
            <ShieldCheck size={14} /> Verified content
          </span>
          <span>
            <Layers size={14} /> One copy protected
          </span>
          <span>
            <HardDrive size={14} /> Local database
          </span>
        </div>
      </div>
      <div className="history-chart-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">LOCAL SCAN TIMELINE</span>
            <h2>Your collection over time</h2>
          </div>
          <button title="Open scan history" onClick={onHistory}>
            <ArrowUpRight size={19} />
          </button>
        </div>
        {scans.length > 1 ? (
          <>
            <svg
              viewBox="0 0 500 135"
              role="img"
              aria-label="File counts across completed scans"
            >
              <defs>
                <linearGradient id="history-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ee3b58" stopOpacity=".25" />
                  <stop offset="100%" stopColor="#ee3b58" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[26, 69, 112].map((y) => (
                <line
                  key={y}
                  x1="20"
                  x2="480"
                  y1={y}
                  y2={y}
                  stroke="#38303b"
                  strokeDasharray="3 5"
                />
              ))}
              <polygon
                points={`20,130 ${points} 480,130`}
                fill="url(#history-fill)"
              />
              <polyline
                points={points}
                fill="none"
                stroke="#ff516e"
                strokeWidth="2.5"
              />
              {scans.map((h, i) => (
                <circle
                  key={h.id}
                  cx={20 + (i * 460) / (scans.length - 1)}
                  cy={112 - (h.files / max) * 86}
                  r="4"
                  fill="#ff889e"
                >
                  <title>
                    {date(h.started)}: {h.files.toLocaleString()} files
                  </title>
                </circle>
              ))}
            </svg>
            <div className="chart-range">
              <span>{new Date(scans[0].started).toLocaleDateString()}</span>
              <span>{new Date(scans.at(-1).started).toLocaleDateString()}</span>
            </div>
          </>
        ) : (
          <div className="timeline-empty">
            <Activity size={32} />
            <strong>
              {scans.length
                ? "One scan. A baseline to build on."
                : "A timeline built from your scans."}
            </strong>
            <small>Complete at least two scans to compare file counts.</small>
          </div>
        )}
        <div className="timeline-stats">
          <div>
            <strong>{scans.length}</strong>
            <small>completed snapshots shown</small>
          </div>
          <div>
            <strong>
              {duration(scans.reduce((n, h) => n + h.elapsed, 0))}
            </strong>
            <small>total time in these scans</small>
          </div>
        </div>
      </div>
    </section>
  );
}
export function LiveScan({
  progress,
  onControl,
  disabled,
}: {
  progress: any;
  onControl: (command: string) => void;
  disabled: boolean;
}) {
  const phases = [
      "Discovering",
      "Fingerprinting",
      "SHA-256 hashing",
      "Byte verification",
      "Image fingerprints",
    ],
    index = phases.indexOf(progress.phase);
  const ratio = progress.total
    ? Math.min(100, (100 * progress.processed) / progress.total)
    : 0;
  const rate =
    progress.phaseElapsed > 0
      ? (progress.total ? progress.processed : progress.files) /
        (progress.phaseElapsed / 1000)
      : 0;
  const remaining =
    progress.total && rate > 0
      ? (progress.total - progress.processed) / rate
      : 0;
  return (
    <section className="live-scan-console">
      <div className="section-title">
        <div>
          <span className="eyebrow">LIVE SCAN TELEMETRY</span>
          <h2>
            <span className={`live-dot ${progress.paused ? "paused" : ""}`} />
            {progress.paused ? "Hunt paused" : progress.phase}
          </h2>
        </div>
        <div className="row">
          <Button
            disabled={disabled}
            onClick={() => onControl(progress.paused ? "resume" : "pause")}
          >
            {progress.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
            {progress.paused ? "Resume" : "Pause"}
          </Button>
          <Button disabled={disabled} onClick={() => onControl("cancel")}>
            <Square size={13} /> Cancel scan
          </Button>
        </div>
      </div>
      <div className="phase-pipeline">
        {phases.map((phase, i) => (
          <div
            key={phase}
            className={`${i === index ? "current" : ""} ${index > i ? "done" : ""}`}
          >
            <span>
              {index > i ? <Check size={13} /> : String(i + 1).padStart(2, "0")}
            </span>
            <strong>{phase}</strong>
            {i < phases.length - 1 && <ChevronRight size={14} />}
          </div>
        ))}
      </div>
      <div className="telemetry-grid">
        <div>
          <small>FILES DISCOVERED</small>
          <strong>{progress.files.toLocaleString()}</strong>
          <span>{bytes(progress.bytes)} indexed</span>
        </div>
        <div>
          <small>PHASE PROGRESS</small>
          <strong>
            {progress.total ? `${Math.round(ratio)}%` : "Discovering"}
          </strong>
          <span>
            {progress.total
              ? `${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()} candidates`
              : "The file count is still being discovered"}
          </span>
        </div>
        <div>
          <small>AVERAGE PHASE PACE</small>
          <strong>
            {Math.round(rate).toLocaleString()}
            <em>/ sec</em>
          </strong>
          <span>
            {progress.paused
              ? "Paused"
              : remaining
                ? `~${duration(remaining * 1000)} remaining in this phase`
                : "Measured from this phase’s elapsed time"}
          </span>
        </div>
        <div>
          <small>ELAPSED / ISSUES</small>
          <strong>{duration(progress.elapsed)}</strong>
          <span>
            {progress.errors.toLocaleString()} scan diagnostics recorded
          </span>
        </div>
      </div>
      <div className="console-progress">
        <div
          className={!progress.total && !progress.paused ? "indeterminate" : ""}
          style={{ width: progress.total ? `${ratio}%` : "25%" }}
        />
      </div>
      <div className="current-path">
        <FolderOpen size={14} />
        <span title={progress.currentPath}>
          {progress.currentPath || "Preparing scan locations…"}
        </span>
        <span className="read-only-badge">READ ONLY</span>
      </div>
    </section>
  );
}
export function FolderMap({
  rows,
  onOpen,
}: {
  rows: any[];
  onOpen: (directory: string) => void;
}) {
  const total = rows.reduce((n, r) => n + r.bytes, 0);
  return (
    <section className="panel folder-map-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">FOLLOW THE STORAGE</span>
          <h2>Duplicate hotspots</h2>
        </div>
        <span className="quiet-label">Click a folder to investigate</span>
      </div>
      {rows.length ? (
        <div className="folder-mosaic">
          {rows.map((r, i) => (
            <button
              key={r.label}
              onClick={() => onOpen(r.label)}
              style={
                {
                  flexGrow: Math.max(1, (r.bytes / (total || 1)) * 20),
                  flexBasis: `${Math.max(17, Math.min(46, (100 * r.bytes) / (total || 1)))}%`,
                  "--tile-hue": `${348 + i * 5}`,
                } as React.CSSProperties
              }
              title={r.label}
            >
              <FolderOpen size={20} />
              <strong>{basename(r.label) || r.label}</strong>
              <span>{bytes(r.bytes)}</span>
              <small>{r.count.toLocaleString()} copies in exact groups</small>
              <ArrowUpRight className="tile-arrow" size={17} />
            </button>
          ))}
        </div>
      ) : (
        <div className="timeline-empty">
          <FolderOpen size={30} />
          <p>No duplicate hotspots in this snapshot.</p>
        </div>
      )}
      <p className="muted">
        Tiles represent all copies in exact groups, including retained files.
        Tile totals are not cleanup savings.
      </p>
    </section>
  );
}
export function FileInspector({
  data,
  selected,
  isPreferred,
  onClose,
  onToggle,
  onAction,
  onPreferFolder,
}: {
  data: any;
  selected: boolean;
  isPreferred: boolean;
  onClose: () => void;
  onToggle: () => void;
  onAction: (action: string) => void;
  onPreferFolder: () => void;
}) {
  const f = data.file;
  return (
    <div className="inspector-backdrop" onClick={onClose}>
      <section
        className="file-inspector"
        role="dialog"
        aria-modal="true"
        aria-label="File inspector"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">
          <span className="eyebrow">FILE INSPECTOR</span>
          <button aria-label="Close file inspector" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="inspector-file-icon">
          <FileText size={36} />
          <span>{f.ext || "FILE"}</span>
        </div>
        <h2>{basename(f.path)}</h2>
        <p className="full-path">{f.path}</p>
        <div className={`inspector-status ${data.availability}`}>
          <ShieldCheck size={16} />
          {data.availability === "present"
            ? "Matches the scanned file snapshot"
            : data.availability === "changed"
              ? "Changed since scanning — rescan before cleanup"
              : data.availability === "missing"
                ? "File is no longer at this location"
                : "File cannot currently be inspected"}
        </div>
        <div className="inspector-actions">
          <Button onClick={() => onAction("reveal")}>
            <FolderOpen size={14} /> Reveal
          </Button>
          <Button onClick={() => onAction("copy")}>
            <Copy size={14} /> Path
          </Button>
        </div>
        <dl className="metadata-grid">
          <div>
            <dt>FILE SIZE</dt>
            <dd>{bytes(f.size)}</dd>
          </div>
          <div>
            <dt>MODIFIED</dt>
            <dd>{date(new Date(f.mtime).toISOString())}</dd>
          </div>
          <div>
            <dt>FORMAT</dt>
            <dd>{f.ext || "No extension"}</dd>
          </div>
          <div>
            <dt>HARD LINKS</dt>
            <dd>{f.nlink}</dd>
          </div>
          <div>
            <dt>SCAN SNAPSHOT</dt>
            <dd>{date(data.scan.started)}</dd>
          </div>
          <div>
            <dt>CLEANUP PROTECTION</dt>
            <dd>{data.protected ? "Protected" : "Review permitted"}</dd>
          </div>
          {f.width && (
            <div>
              <dt>IMAGE DIMENSIONS</dt>
              <dd>
                {f.width} × {f.height}
              </dd>
            </div>
          )}
        </dl>
        <div className="inspector-checksum">
          <div>
            <strong>SHA-256 fingerprint</strong>
            {f.hash && (
              <button
                aria-label="Copy checksum"
                onClick={() => onAction("copyHash")}
              >
                <Copy size={14} />
              </button>
            )}
          </div>
          <code>{f.hash || "No full checksum was needed for this file."}</code>
        </div>
        <div className="peer-list">
          <h3>Copies in this exact group</h3>
          {!data.peers.length && (
            <p className="muted">
              This file is not in a verified exact duplicate group.
            </p>
          )}
          {data.peers.map((p: any) => (
            <div key={p.id} className={p.id === f.id ? "current" : ""}>
              <FilesIcon />
              <span title={p.path}>{p.path}</span>
              {p.id === f.id && <small>THIS FILE</small>}
              {p.state !== "present" && <small>{p.state.toUpperCase()}</small>}
            </div>
          ))}
          {data.peers.length === 50 && (
            <small>Showing the first 50 recorded copies.</small>
          )}
        </div>
        <div className="preference-card">
          <div>
            <Sparkles size={16} />
            <span>
              <strong>
                {isPreferred
                  ? "Preferred keep location"
                  : "Teach your keep preference"}
              </strong>
              <small>
                {isPreferred
                  ? "Recommendations favor this folder."
                  : "Future duplicate reviews can favor copies stored here."}
              </small>
            </span>
          </div>
          <Button onClick={onPreferFolder}>
            {isPreferred ? "Forget folder" : "Prefer this folder"}
          </Button>
        </div>
        <div className="inspector-bottom">
          <p>
            Inspection is read-only. Selection adds a file to your review queue;
            it does not delete it.
          </p>
          <Button
            kind={selected ? "" : "primary"}
            disabled={
              data.protected ||
              data.availability !== "present" ||
              !f.group_id ||
              f.state !== "present"
            }
            onClick={onToggle}
          >
            {selected ? "Remove from cleanup review" : "Add to cleanup review"}{" "}
            <ChevronRight size={16} />
          </Button>
        </div>
      </section>
    </div>
  );
}
function FilesIcon() {
  return <Layers size={14} />;
}
export function ComparisonStage({
  files,
  urls,
  tools,
  onError,
}: {
  files: any[];
  urls: string[];
  tools: (file: any) => React.ReactNode;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState("side"),
    [reveal, setReveal] = useState(50),
    [zoom, setZoom] = useState(1);
  const imagesOnly =
    files.length === 2 &&
    files.every((f) => !/\.(mp4|webm|mov|mkv|avi|wmv|m4v)$/i.test(f.path));
  return (
    <>
      <div className="comparison-controls">
        <div className="segmented">
          <button
            className={mode === "side" ? "active" : ""}
            onClick={() => setMode("side")}
          >
            <Layers size={14} /> Side by side
          </button>
          {imagesOnly && (
            <button
              className={mode === "wipe" ? "active" : ""}
              onClick={() => setMode("wipe")}
            >
              <SlidersHorizontal size={14} /> Reveal overlay
            </button>
          )}
        </div>
        <label>
          <ZoomIn size={15} /> {Math.round(zoom * 100)}%
          <input
            type="range"
            min="1"
            max="3"
            step=".25"
            aria-label="Image comparison zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
      </div>
      {mode === "wipe" && imagesOnly ? (
        <>
          <div className="image-wipe">
            <div
              className="wipe-images"
              style={{ transform: `scale(${zoom})` }}
            >
              <img src={urls[0]} alt={`A: ${basename(files[0].path)}`} />
              <div style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}>
                <img src={urls[1]} alt={`B: ${basename(files[1].path)}`} />
              </div>
            </div>
            <span className="wipe-a">A</span>
            <span className="wipe-b">B</span>
          </div>
          <label className="wipe-control">
            Reveal file B over file A
            <input
              aria-label="Reveal file B"
              type="range"
              min="0"
              max="100"
              value={reveal}
              onChange={(e) => setReveal(Number(e.target.value))}
            />
          </label>
        </>
      ) : (
        <div className={`media-comparison ${files.length > 2 ? "multi" : ""}`}>
          {files.map((f, i) => (
            <div key={f.id}>
              <div className="comparison-viewport">
                {/\.(mp4|webm|mov|mkv|avi|wmv|m4v)$/i.test(f.path) ? (
                  <video
                    controls
                    src={urls[i]}
                    onError={() =>
                      onError(
                        "This codec cannot be previewed. Use Open with Windows.",
                      )
                    }
                  />
                ) : (
                  <img
                    src={urls[i]}
                    style={{ transform: `scale(${zoom})` }}
                    alt={basename(f.path)}
                    onError={() =>
                      onError(
                        "This format cannot be previewed. Use Open with Windows.",
                      )
                    }
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="comparison-metadata">
        {files.map((f, i) => (
          <div key={f.id}>
            <span className="quiet-label">
              FILE {String.fromCharCode(65 + i)}
            </span>
            <h3>{basename(f.path)}</h3>
            <p className="full-path">{f.path}</p>
            <small>
              {bytes(f.size)}
              {f.width ? ` · ${f.width} × ${f.height}` : ""} ·{" "}
              {date(new Date(f.mtime).toISOString())}
            </small>
            {f.hash && <code>SHA-256 {f.hash}</code>}
            {tools(f)}
          </div>
        ))}
      </div>
    </>
  );
}
export type WorkspaceCommand = {
  label: string;
  description: string;
  icon: React.ReactNode;
  run: () => void;
};
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: WorkspaceCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    filtered = commands.filter((c) =>
      (c.label + " " + c.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  return (
    <div className="modal-backdrop command-backdrop" onClick={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => (i + 1) % Math.max(1, filtered.length));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex(
              (i) => (i - 1 + filtered.length) % Math.max(1, filtered.length),
            );
          }
          if (e.key === "Enter" && filtered[index]) {
            onClose();
            filtered[index].run();
          }
        }}
      >
        <div className="command-search">
          <Search size={21} />
          <input
            autoFocus
            aria-label="Search commands"
            placeholder="Where would you like to go?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
          />
          <button aria-label="Close command palette" onClick={onClose}>
            <kbd>ESC</kbd>
          </button>
        </div>
        <div className="command-results">
          {filtered.length ? (
            filtered.map((c, i) => (
              <button
                key={c.label}
                className={i === index ? "active" : ""}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  onClose();
                  c.run();
                }}
              >
                {c.icon}
                <span>
                  <strong>{c.label}</strong>
                  <small>{c.description}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))
          ) : (
            <p className="muted">No commands match that search.</p>
          )}
        </div>
        <div className="command-footer">
          <span>↑ ↓ to navigate · Enter to open</span>
          <span>
            <Command size={12} /> K
          </span>
        </div>
      </section>
    </div>
  );
}
