import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  ScanLine,
  Files,
  Images,
  Film,
  ChartNoAxesCombined,
  Trash2,
  RotateCcw,
  History,
  Settings2,
  ShieldCheck,
  FolderPlus,
  Play,
  Pause,
  Square,
  Search,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  Copy,
  FolderOpen,
  X,
  Minus,
  Maximize2,
  Download,
  Check,
  HardDrive,
  LoaderCircle,
  AlertTriangle,
  Eye,
  CheckCheck,
  SlidersHorizontal,
  Zap,
  Shield,
  ArrowRight,
  RefreshCw,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Button,
  Empty,
  Metric,
  Distribution,
  DrivePanel,
  Group,
  Pager,
  MediaThumb,
  Bars,
  AnalyticsBars,
  Toggle,
} from "./components";
import { bytes, date, duration, basename } from "./format";
import {
  ScanProfiles,
  FilterPanel,
  WorkspaceOverview,
  CleanupMission,
  BurstReview,
  LiveScan,
  FolderMap,
  FileInspector,
  ComparisonStage,
  CommandPalette,
  defaultFilters,
} from "./features";
import type { ExplorerFilters, WorkspaceCommand } from "./features";
import "./style.css";
import "./upgrade.css";

declare global {
  interface Window {
    hunter: {
      call: (method: string, payload?: any) => Promise<any>;
      window: (command: string) => void;
      onUpdate: (callback: (event: any) => void) => () => void;
    };
  }
}
type Page =
  | "Dashboard"
  | "Scan Center"
  | "Duplicate Explorer"
  | "Similar Images"
  | "Video Intelligence"
  | "Storage Analytics"
  | "Cleanup Center"
  | "Recovery Center"
  | "Scan History"
  | "Settings";
const pages: [Page, LucideIcon][] = [
  ["Dashboard", LayoutDashboard],
  ["Scan Center", ScanLine],
  ["Duplicate Explorer", Files],
  ["Similar Images", Images],
  ["Video Intelligence", Film],
  ["Storage Analytics", ChartNoAxesCombined],
  ["Cleanup Center", Trash2],
  ["Recovery Center", RotateCcw],
  ["Scan History", History],
  ["Settings", Settings2],
];
const descriptions: Record<Page, string> = {
  Dashboard: "Your files. Your space. Under control.",
  "Scan Center": "Find identical files with evidence you can trust.",
  "Duplicate Explorer": "Verified byte for byte. You decide what stays.",
  "Similar Images":
    "Visual similarity is a clue, never proof of identical content.",
  "Video Intelligence": "Exact duplicate videos, verified beyond the filename.",
  "Storage Analytics": "See where your storage goes and where copies collect.",
  "Cleanup Center": "Review every selection. Keep a verified copy.",
  "Recovery Center": "A clear record of what moved and what can come back.",
  "Scan History": "Your local scan archive. Reopen, compare, or scan again.",
  Settings: "Tune your workflow. Keep everything local.",
};
const containingFolder = (filePath: string) => {
  const index = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  if (index < 0) return filePath;
  if (index === 2 && /^[A-Za-z]:/.test(filePath)) return filePath.slice(0, 3);
  return index === 0 ? filePath.slice(0, 1) : filePath.slice(0, index);
};
function App() {
  const [page, setPage] = useState<Page>("Dashboard"),
    [state, setState] = useState<any>(null),
    [scanId, setScanId] = useState<string>(),
    [settings, setSettings] = useState<any>(null);
  const [roots, setRoots] = useState<string[]>([]),
    [progress, setProgress] = useState<any>(null),
    [toast, setToastValue] = useState(""),
    [working, setWorking] = useState(false),
    [revision, setRevision] = useState(0);
  const [groups, setGroups] = useState<any>({ total: 0, groups: [] }),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("size"),
    [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Map<number, any>>(new Map()),
    [preview, setPreview] = useState<any>(null),
    [plan, setPlan] = useState<any>(null),
    [pairs, setPairs] = useState<any>({ total: 0, pairs: [] }),
    [bursts, setBursts] = useState<any>({
      totalImages: 0,
      truncated: false,
      bursts: [],
    }),
    [pairOffset, setPairOffset] = useState(0),
    [threshold, setThreshold] = useState(90);
  const [drives, setDrives] = useState<any[]>([]),
    [errorList, setErrorList] = useState<any | null>(null),
    [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set()),
    [errorOffset, setErrorOffset] = useState(0),
    [errorFilter, setErrorFilter] = useState(""),
    [compare, setCompare] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<any>({
    directories: [],
    drives: [],
    sizes: [],
  });
  const [context, setContext] = useState<any>(null);
  const [filters, setFilters] = useState<ExplorerFilters>({
    ...defaultFilters,
  });
  const [inspector, setInspector] = useState<any>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [toastIsError, setToastIsError] = useState(false);
  const viewedScan = useRef<string | undefined>(undefined);
  const setToast = (value: string) => {
    setToastValue(value);
    setToastIsError(false);
  };
  const message = (e: any) => {
    setToastValue(e instanceof Error ? e.message : String(e));
    setToastIsError(true);
  };
  const run = async (fn: () => Promise<any>) => {
    setWorking(true);
    try {
      return await fn();
    } catch (e) {
      message(e);
    } finally {
      setWorking(false);
    }
  };
  const apply = (data: any) => {
    setState(data);
    setProgress(data.progress);
    if (!settings) {
      setSettings(data.settings);
      setThreshold(data.settings.similarity);
    }
  };
  const load = async (id?: string) => {
    const data = await window.hunter.call("boot", id);
    apply(data);
    return data;
  };
  const loadIssues = async (scanId: string, offset = 0, code = "") => {
    const result = await window.hunter.call("errors", {
      scanId,
      offset,
      code,
    });
    setErrorList({
      ...result,
      commonFolder:
        result.commonFolder ?? (offset > 0 ? errorList?.commonFolder : null),
      scanId,
    });
    setErrorOffset(offset);
    setErrorFilter(code);
    setSelectedIssues(new Set());
  };
  const copySelectedIssues = () =>
    run(async () => {
      const count = await window.hunter.call("copyIssuePaths", {
        scanId: errorList?.scanId,
        ids: [...selectedIssues],
      });
      setToast(`${count} diagnostic paths copied.`);
    });
  const saveIssueExclusions = (paths: string[], kind: string) =>
    run(async () => {
      const exclusions = [...new Set([...settings.exclusions, ...paths])];
      if (exclusions.length > 100)
        throw new Error(
          `You can save up to 100 exclusions. This action would create ${exclusions.length}.`,
        );
      const saved = await window.hunter.call("saveSettings", {
        ...settings,
        exclusions,
      });
      setSettings(saved);
      setState({ ...state, settings: saved });
      setSelectedIssues(new Set());
      setToast(
        `${paths.length} ${kind}${paths.length === 1 ? "" : "s"} excluded from future scans.`,
      );
    });
  const excludeSelectedIssues = (folders: boolean) =>
    saveIssueExclusions(
      [
        ...new Set<string>(
          (errorList?.rows || [])
            .filter((issue: any) => selectedIssues.has(issue.id))
            .map((issue: any) =>
              folders ? containingFolder(issue.path) : issue.path,
            ),
        ),
      ],
      folders ? "folder" : "file",
    );
  useEffect(() => {
    load().catch(message);
    window.hunter.call("drives").then(setDrives).catch(message);
    return window.hunter.onUpdate((e) => {
      if (e.type === "progress") setProgress(e.progress);
      if (e.type === "error") message(e.error);
      if (e.type === "refresh") {
        if (viewedScan.current && e.state.summary?.id !== viewedScan.current) {
          window.hunter
            .call("boot", viewedScan.current)
            .then((data) => {
              setState(data);
              setProgress(data.progress);
              setRevision((v) => v + 1);
            })
            .catch(message);
          return;
        }
        setState(e.state);
        setProgress(e.state.progress);
        setRevision((v) => v + 1);
      }
    });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const currentId = scanId || state?.summary?.id;
  useEffect(() => {
    if (!currentId || page !== "Storage Analytics") return;
    let active = true;
    window.hunter
      .call("analytics", currentId)
      .then((value) => {
        if (active) setAnalytics(value);
      })
      .catch(message);
    return () => {
      active = false;
    };
  }, [currentId, page, revision]);
  useEffect(() => {
    if (
      !currentId ||
      !["Duplicate Explorer", "Video Intelligence", "Dashboard"].includes(page)
    )
      return;
    if (
      page !== "Dashboard" &&
      filters.maxSize &&
      filters.maxSize < filters.minSize
    ) {
      setGroups({ total: 0, groups: [], savings: 0 });
      setGroupsLoading(false);
      return;
    }
    let active = true;
    setGroupsLoading(true);
    window.hunter
      .call("groups", {
        scanId: currentId,
        offset: page === "Dashboard" ? 0 : offset,
        search: page === "Dashboard" ? "" : query,
        kind: page === "Video Intelligence" ? "video" : "all",
        sort,
        ...(page === "Dashboard" ? defaultFilters : filters),
      })
      .then((value) => {
        if (active) setGroups(value);
      })
      .catch(message)
      .finally(() => {
        if (active) setGroupsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentId, page, offset, query, sort, revision, filters]);
  useEffect(() => {
    if (!currentId || page !== "Similar Images") return;
    let active = true;
    window.hunter
      .call("pairs", { scanId: currentId, offset: pairOffset, threshold })
      .then((value) => {
        if (active) setPairs(value);
      })
      .catch(message);
    return () => {
      active = false;
    };
  }, [currentId, page, pairOffset, threshold, revision]);
  useEffect(() => {
    if (!currentId || page !== "Similar Images") return;
    let active = true;
    window.hunter
      .call("bursts", currentId)
      .then((value) => {
        if (active) setBursts(value);
      })
      .catch(message);
    return () => {
      active = false;
    };
  }, [currentId, page, revision]);
  useEffect(() => {
    setPlan(null);
  }, [selected]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreview(null);
        setErrorList(null);
        setContext(null);
        setInspector(null);
        setCommandOpen(false);
      }
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPreview(null);
        setErrorList(null);
        setInspector(null);
        setCommandOpen((v) => !v);
      }
      if (e.ctrlKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        setPage(pages[Number(e.key) - 1][0]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!preview && !errorList && !inspector && !commandOpen) return;
    const prior = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!modal) return;
    const focusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),video[controls],[tabindex="0"]',
        ),
      );
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (!first) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !modal.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      prior?.focus();
    };
  }, [preview, errorList, inspector, commandOpen]);
  const navigate = (p: Page) => {
    setPage(p);
    setOffset(0);
    setSearch("");
  };
  const choose = () =>
    run(async () => {
      const values = await window.hunter.call("chooseFolders");
      setRoots((old) => [...new Set([...old, ...values])]);
    });
  const start = () =>
    run(async () => {
      const id = await window.hunter.call("startScan", {
        roots,
        options: settings,
      });
      setScanId(undefined);
      setFilters({ ...defaultFilters });
      setOffset(0);
      setSearch("");
      viewedScan.current = undefined;
      setSelected(new Map());
      setPlan(null);
      await load(id);
      setPage("Scan Center");
    });
  const toggle = (file: any) =>
    setSelected((old) => {
      const next = new Map(old);
      if (next.has(file.id)) next.delete(file.id);
      else if (next.size < 1000) next.set(file.id, file);
      else message("Review up to 1,000 files per cleanup operation.");
      return next;
    });
  const selectGroup = (g: any) =>
    setSelected((old) => {
      const next = new Map(old);
      for (const f of g.files)
        if (f.id !== g.keep.id && !f.protected && next.size < 1000)
          next.set(f.id, f);
      next.delete(g.keep.id);
      return next;
    });
  const action = (file: any, action: string) =>
    run(async () => {
      const result = await window.hunter.call("fileAction", {
        id: file.id,
        action,
      });
      if (action === "copy") setToast("Path copied.");
      if (action === "copyHash") setToast("SHA-256 checksum copied.");
      if (action === "preview") {
        setInspector(null);
        setPreview({ files: [file], urls: [result] });
      }
    });
  const showCompare = (files: any[]) =>
    run(async () => {
      const urls = await Promise.all(
        files.map((f) =>
          window.hunter.call("fileAction", { id: f.id, action: "preview" }),
        ),
      );
      setPreview({ files, urls });
      setInspector(null);
    });
  const openScan = (id: string) =>
    run(async () => {
      setScanId(id);
      setFilters({ ...defaultFilters });
      setSearch("");
      viewedScan.current = id;
      await load(id);
      setPage("Duplicate Explorer");
      setOffset(0);
      setSelected(new Map());
      setRevision((v) => v + 1);
    });
  const exportReport = (format: string) =>
    run(async () => {
      if (
        await window.hunter.call("exportReport", { scanId: currentId, format })
      )
        setToast("Report exported.");
    });
  const s = state?.summary,
    hasResults = Boolean(s),
    selectedBytes = [...selected.values()].reduce((n, f) => n + f.size, 0),
    active = Boolean(progress);
  if (!state || !settings)
    return (
      <div className="loading">
        <LoaderCircle className="spin" /> Opening your local workspace…
      </div>
    );
  const exportButtons = (
    <div className="row">
      <Button
        onClick={() => exportReport("csv")}
        disabled={!hasResults || working}
      >
        <Download size={15} /> CSV
      </Button>
      <Button
        onClick={() => exportReport("json")}
        disabled={!hasResults || working}
      >
        JSON
      </Button>
    </div>
  );
  const noScan = (
    <Empty
      title="A clean start"
      action={
        <Button kind="primary" onClick={() => navigate("Scan Center")}>
          <ScanLine size={17} /> Set up your first scan
        </Button>
      }
    >
      Choose a folder to discover verified duplicates. Your results and file
      details stay on this computer.
    </Empty>
  );
  const commands: WorkspaceCommand[] = [
    ...pages.map(([label, Icon]) => ({
      label,
      description: descriptions[label],
      icon: <Icon size={19} />,
      run: () => navigate(label),
    })),
    ...(active
      ? [
          {
            label: progress.paused ? "Resume active scan" : "Pause active scan",
            description: "Control the current scan worker",
            icon: progress.paused ? <Play size={19} /> : <Pause size={19} />,
            run: () => {
              run(() =>
                window.hunter.call(
                  "control",
                  progress.paused ? "resume" : "pause",
                ),
              );
            },
          },
          {
            label: "Cancel active scan",
            description: "Stop scanning and keep partial scan history",
            icon: <Square size={19} />,
            run: () => {
              run(() => window.hunter.call("control", "cancel"));
            },
          },
        ]
      : []),
    ...(hasResults && !active
      ? [
          {
            label: "Export CSV report",
            description:
              "Save this scan to a local spreadsheet-friendly report",
            icon: <Download size={19} />,
            run: () => {
              exportReport("csv");
            },
          },
        ]
      : []),
  ];
  const fileTools = (f: any) => (
    <div className="file-tools">
      <button
        title="Inspect file metadata"
        aria-label="Inspect file metadata"
        onClick={() =>
          run(async () =>
            setInspector(await window.hunter.call("inspectFile", f.id)),
          )
        }
      >
        <Info size={15} />
      </button>
      <button
        title="Reveal in Explorer"
        aria-label="Reveal in Explorer"
        onClick={() => action(f, "reveal")}
      >
        <FolderOpen size={15} />
      </button>
      <button
        title="Copy path"
        aria-label="Copy path"
        onClick={() => action(f, "copy")}
      >
        <Copy size={15} />
      </button>
      {/\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|avif|mp4|webm|mov|mkv|avi|wmv|m4v)$/.test(
        f.path.toLowerCase(),
      ) && (
        <button
          title="Preview media"
          aria-label="Preview media"
          onClick={() => action(f, "preview")}
        >
          <Eye size={15} />
        </button>
      )}
      <button
        title="Open with Windows (confirmation required)"
        aria-label="Open with Windows"
        onClick={() => action(f, "open")}
      >
        <ArrowUpRight size={15} />
      </button>
    </div>
  );

  return (
    <div
      className={settings.reducedMotion ? "app reduced-motion" : "app"}
      onClick={() => setContext(null)}
      onContextMenu={(e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-file-id]",
        );
        if (!row) return;
        const file = groups.groups
          .flatMap((g: any) => g.files)
          .find((f: any) => f.id === Number(row.dataset.fileId));
        if (!file) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        setContext({
          file,
          x: Math.min(e.clientX || rect.left + 30, window.innerWidth - 215),
          y: Math.min(e.clientY || rect.top + 20, window.innerHeight - 140),
        });
      }}
    >
      <div className="titlebar">
        <span>
          <span className="title-dot" /> DaemonCore: Duplicate Hunter
        </span>
        <span className="title-private">
          <ShieldCheck size={12} /> LOCAL WORKSPACE
        </span>
        <div className="window-controls">
          <button
            aria-label="Minimize"
            onClick={() => window.hunter.window("minimize")}
          >
            <Minus size={15} />
          </button>
          <button
            aria-label="Maximize or restore"
            onClick={() => window.hunter.window("maximize")}
          >
            <Maximize2 size={13} />
          </button>
          <button
            className="close"
            aria-label="Close"
            onClick={() => window.hunter.window("close")}
          >
            <X size={17} />
          </button>
        </div>
      </div>
      <aside>
        <div className="brand">
          <img
            src="./daemoncore-logo-transparent.png"
            alt="DaemonCore Duplicate Hunter"
          />
          <div className="brand-caption">FILE INTELLIGENCE, UNLEASHED.</div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {pages.map(([p, Icon], i) => (
            <React.Fragment key={p}>
              {i === 6 && (
                <div className="nav-caption section-caption">
                  MANAGE & PROTECT
                </div>
              )}
              <button
                title={i < 3 ? `Ctrl+${i + 1}` : p}
                className={page === p ? "nav-item current" : "nav-item"}
                onClick={() => navigate(p)}
              >
                <Icon size={18} />
                <span>{p}</span>
                {p === "Cleanup Center" && selected.size > 0 && (
                  <b>{selected.size}</b>
                )}
                {page === p && <span className="nav-indicator" />}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <div>
            <strong>Private by design</strong>
            <small>Offline. No account. No uploads.</small>
          </div>
        </div>
        <div className="version">
          DAEMONCORE ENTERPRISES <span>v{state.version}</span>
        </div>
      </aside>
      <main>
        <div className="workspace-topline">
          <span>
            <span className="live-dot" /> PERSONAL FILE INTELLIGENCE
          </span>
          <button onClick={() => setCommandOpen(true)}>
            <Search size={14} /> Jump to a tool <kbd>Ctrl K</kbd>
          </button>
        </div>
        <header>
          <div>
            <div className="eyebrow">DAEMONCORE / {page.toUpperCase()}</div>
            <h1>{page}</h1>
            <p>{descriptions[page]}</p>
          </div>
          <div>
            {page === "Dashboard" ? (
              <Button kind="primary" onClick={() => navigate("Scan Center")}>
                <ScanLine size={17} /> New scan <ArrowRight size={16} />
              </Button>
            ) : [
                "Storage Analytics",
                "Duplicate Explorer",
                "Scan History",
              ].includes(page) ? (
              exportButtons
            ) : (
              <span className="privacy-pill">
                <span /> 100% local analysis
              </span>
            )}
          </div>
        </header>
        {active && page !== "Scan Center" && (
          <button
            className="active-banner"
            onClick={() => navigate("Scan Center")}
          >
            <LoaderCircle className={progress.paused ? "" : "spin"} size={16} />
            {progress.paused ? "Paused" : progress.phase} ·{" "}
            {progress.files.toLocaleString()} files discovered{" "}
            <ArrowRight size={15} />
          </button>
        )}
        {s && s.status !== "running" && (
          <div className="snapshot-note">
            <History size={13} /> Snapshot from {date(s.started)} · {s.status}.
            Files may have changed since scanning.
            {s.errors > 0 && (
              <button onClick={() => run(() => loadIssues(s.id))}>
                {s.errors.toLocaleString()} scan diagnostics
              </button>
            )}
          </div>
        )}

        {page === "Dashboard" && (
          <>
            <section className="hero">
              <div>
                <span className="pill">
                  <Zap size={13} /> PRECISION OVER GUESSWORK
                </span>
                <h2>
                  Hunt the copies.
                  <br />
                  <em>Keep what matters.</em>
                </h2>
                <p>
                  Find hidden duplicates. Make room for what’s next.
                  <br />
                  Every exact match is checked, down to the last byte.
                </p>
                <Button kind="primary" onClick={() => navigate("Scan Center")}>
                  Launch a scan <ArrowUpRight size={17} />
                </Button>
              </div>
              <div className="hero-emblem" aria-hidden="true">
                <div className="emblem-orbit" />
                <img src="./daemoncore-logo-transparent.png" alt="" />
                <span>EXACT MATCHES. EXPLAINED DECISIONS.</span>
              </div>
            </section>
            <div className="metrics">
              <Metric
                label="Files scanned"
                value={(s?.files || 0).toLocaleString()}
                detail={
                  s ? `${bytes(s.bytes)} analyzed` : "Ready for your first scan"
                }
                icon={Files}
              />
              <Metric
                label="Duplicate groups"
                value={(s?.groups_count || 0).toLocaleString()}
                detail="Exact matches only"
                icon={Copy}
              />
              <Metric
                label="Potential savings"
                value={bytes(s?.savings)}
                detail="Excludes hard-linked files"
                icon={HardDrive}
                accent
              />
              <Metric
                label="Copies to protect"
                value={(s?.protectedCopies || 0).toLocaleString()}
                detail="Keep at least one per group"
                icon={ShieldCheck}
              />
            </div>
            <CleanupMission
              groups={groupsLoading ? [] : groups.groups}
              onBuild={(files, saved, target) => {
                setSelected(files);
                setPage("Cleanup Center");
                setToast(
                  `${bytes(saved)} selected toward your ${bytes(target)} goal. Review every file before cleanup.`,
                );
              }}
            />
            <WorkspaceOverview
              summary={s}
              history={state.history}
              onExplore={() => navigate("Duplicate Explorer")}
              onHistory={() => navigate("Scan History")}
              onScan={() => navigate("Scan Center")}
            />
            <div className="two-columns">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Duplicate distribution</h2>
                  <span className="subtle">BY STORAGE</span>
                </div>
                {s?.distribution?.length ? (
                  <Distribution rows={s.distribution} />
                ) : (
                  <div className="chart-empty">
                    <div className="empty-donut">
                      <Files size={26} />
                    </div>
                    <p>Real results appear after your first scan.</p>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Recent activity</h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("Scan History")}
                  >
                    View history <ArrowUpRight size={14} />
                  </button>
                </div>
                {state.history.length ? (
                  state.history.slice(0, 4).map((h: any) => (
                    <button
                      className="activity"
                      key={h.id}
                      onClick={() => openScan(h.id)}
                    >
                      <span className="activity-icon">
                        <ScanLine size={17} />
                      </span>
                      <span>
                        <strong>{h.roots.map(basename).join(", ")}</strong>
                        <small>
                          {date(h.started)} · {h.status}
                        </small>
                      </span>
                      <span className="activity-count">
                        {h.files.toLocaleString()}
                        <small>files</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="quiet-empty">
                    <History size={28} />
                    <p>No scan activity yet.</p>
                    <small>
                      Your local history starts with your first scan.
                    </small>
                  </div>
                )}
              </section>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <h2>Largest duplicate groups</h2>
                <button
                  className="text-button"
                  onClick={() => navigate("Duplicate Explorer")}
                >
                  Explore duplicates <ArrowUpRight size={14} />
                </button>
              </div>
              {groups.groups.length ? (
                <div className="largest-list">
                  {groups.groups.slice(0, 4).map((g: any) => (
                    <button
                      key={g.group_id}
                      onClick={() => navigate("Duplicate Explorer")}
                    >
                      <span className="file-tile">
                        <Files size={20} />
                      </span>
                      <span>
                        <strong>{basename(g.first_path)}</strong>
                        <small>
                          {g.copies} identical copies · {bytes(g.size)} each
                        </small>
                      </span>
                      <b>
                        {bytes(g.savings)}
                        <ArrowUpRight size={14} />
                      </b>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="panel-placeholder">
                  No verified duplicates to display.
                </p>
              )}
            </section>
            <DrivePanel drives={drives} />
          </>
        )}

        {page === "Scan Center" && (
          <>
            <ScanProfiles
              profiles={state.profiles || []}
              roots={roots}
              settings={settings}
              disabled={working || active}
              onApply={(options, locations) => {
                setSettings(options);
                if (locations) setRoots(locations);
                setToast(
                  "Scan setup applied. Review the locations, then start your scan.",
                );
              }}
              onSave={(name, id) =>
                run(async () => {
                  const profiles = await window.hunter.call("saveProfile", {
                    ...(id ? { id } : {}),
                    name,
                    roots,
                    options: settings,
                  });
                  setState({ ...state, profiles });
                  setToast("Scan setup saved.");
                  return profiles.find(
                    (p: any) =>
                      p.name.toLowerCase() === name.trim().toLowerCase(),
                  );
                })
              }
              onDelete={(id) =>
                run(async () => {
                  const profiles = await window.hunter.call(
                    "deleteProfile",
                    id,
                  );
                  setState({ ...state, profiles });
                  setToast("Saved setup removed.");
                })
              }
            />
            <div className="two-columns scan-columns">
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    <FolderOpen size={18} /> Scan locations
                  </h2>
                  <Button onClick={choose} disabled={working || active}>
                    <FolderPlus size={15} /> Add folders
                  </Button>
                </div>
                <p className="muted">
                  Choose folders, a drive root, removable storage, or an
                  accessible network share.
                </p>
                {roots.length ? (
                  <div className="locations">
                    {roots.map((root) => (
                      <div key={root}>
                        <FolderOpen size={20} />
                        <span title={root}>{root}</span>
                        <button
                          aria-label={`Remove ${root}`}
                          disabled={active}
                          onClick={() =>
                            setRoots(roots.filter((p) => p !== root))
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    className="drop-area"
                    onClick={choose}
                    disabled={active}
                  >
                    <FolderPlus size={32} />
                    <strong>Choose where the hunt begins</strong>
                    <span>Select one or more folders to get started</span>
                  </button>
                )}
                <div className="notice">
                  <ShieldCheck size={18} />
                  <span>
                    Scanning is read-only. Nothing moves or gets deleted during
                    a scan. Links and junctions are skipped.
                  </span>
                </div>
                <Button
                  kind="primary full"
                  disabled={!roots.length || active || working}
                  onClick={start}
                >
                  <Play size={17} /> Start scan
                </Button>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    <SlidersHorizontal size={18} /> Scan options
                  </h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("Settings")}
                  >
                    All settings <ArrowUpRight size={14} />
                  </button>
                </div>
                <label>
                  Minimum file size (bytes)
                  <input
                    type="number"
                    min="0"
                    value={settings.minSize}
                    disabled={active}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        minSize: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Maximum file size (bytes, 0 = unlimited)
                  <input
                    type="number"
                    min="0"
                    value={settings.maxSize}
                    disabled={active}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        maxSize: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Extensions{" "}
                  <span className="muted">— blank scans all types</span>
                  <input
                    placeholder=".jpg, .mp4, .pdf"
                    value={settings.extensions}
                    disabled={active}
                    onChange={(e) =>
                      setSettings({ ...settings, extensions: e.target.value })
                    }
                  />
                </label>
                <Toggle
                  label="Include dot-prefixed files and folders"
                  detail="Windows hidden/system attributes are not used as a filter."
                  checked={settings.includeHidden}
                  disabled={active}
                  onChange={(v) =>
                    setSettings({ ...settings, includeHidden: v })
                  }
                />
                <Toggle
                  label="Find visually similar images"
                  detail="Adds local perceptual hashing. Slower; approximate matches stay separate."
                  checked={settings.scanImages}
                  disabled={active}
                  onChange={(v) => setSettings({ ...settings, scanImages: v })}
                />
                <div className="scan-method">
                  <Check size={14} /> Size filter <ChevronRight size={12} />{" "}
                  Fingerprint <ChevronRight size={12} /> SHA-256{" "}
                  <ChevronRight size={12} /> Bytes
                </div>
              </section>
            </div>
            {active && (
              <LiveScan
                progress={progress}
                disabled={working}
                onControl={(command) =>
                  run(() => window.hunter.call("control", command))
                }
              />
            )}
            {!active && s && (
              <section className="panel completed">
                <CheckCheck size={28} />
                <div>
                  <h2>Scan {s.status}</h2>
                  <p>
                    {s.files.toLocaleString()} files ·{" "}
                    {s.groups_count.toLocaleString()} groups ·{" "}
                    {bytes(s.savings)} potential savings · {duration(s.elapsed)}
                  </p>
                </div>
                <Button onClick={() => navigate("Duplicate Explorer")}>
                  Review results <ArrowRight size={16} />
                </Button>
              </section>
            )}
            <DrivePanel drives={drives} />
          </>
        )}

        {(page === "Duplicate Explorer" || page === "Video Intelligence") && (
          <>
            {page === "Video Intelligence" && (
              <div className="notice">
                <Film size={20} />
                <span>
                  Exact video detection is included in every scan. Inline
                  playback depends on Chromium codec support. Frame-based
                  near-duplicate video matching is unavailable in this build.
                </span>
              </div>
            )}
            {hasResults ? (
              <>
                <div className="toolbar">
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search file paths"
                      placeholder="Search filenames or locations…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Sort groups"
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="size">Largest savings</option>
                    <option value="copies">Most copies</option>
                    <option value="path">File path</option>
                  </select>
                  <span className="muted">
                    {groups.total.toLocaleString()} groups
                  </span>
                  <Button
                    kind="primary"
                    disabled={!selected.size}
                    onClick={() => navigate("Cleanup Center")}
                  >
                    Review {selected.size} selected <ArrowRight size={15} />
                  </Button>
                </div>
                <FilterPanel
                  value={
                    page === "Video Intelligence"
                      ? { ...filters, category: "video" }
                      : filters
                  }
                  onChange={(next) => {
                    if (
                      page === "Video Intelligence" &&
                      next.category !== "video"
                    )
                      navigate("Duplicate Explorer");
                    setFilters(next);
                    setOffset(0);
                  }}
                  total={groups.total}
                  savings={groups.savings || 0}
                  disabled={working || groupsLoading}
                  onSelect={() => {
                    setSelected((old) => {
                      const next = new Map(old);
                      for (const g of groups.groups) {
                        for (const f of g.files)
                          if (
                            f.id !== g.keep.id &&
                            f.nlink === 1 &&
                            !f.protected &&
                            next.size < 1000
                          )
                            next.set(f.id, f);
                        next.delete(g.keep.id);
                      }
                      return next;
                    });
                    setToast(
                      "Suggested copies on this page added to review. Every group keeps a copy.",
                    );
                  }}
                />
                <div className="notice compact">
                  <Shield size={16} />
                  <span>
                    Keep recommendations follow your folder and timestamp
                    preferences. They do not identify an original.
                  </span>
                </div>
                {groupsLoading ? (
                  <div className="results-loading">
                    <LoaderCircle size={19} className="spin" /> Updating
                    verified results…
                  </div>
                ) : groups.groups.length ? (
                  groups.groups.map((g: any) => (
                    <Group
                      key={g.group_id}
                      group={g}
                      selected={selected}
                      toggle={toggle}
                      selectGroup={selectGroup}
                      tools={fileTools}
                      compare={showCompare}
                    />
                  ))
                ) : (
                  <Empty icon={Files} title="No matching duplicate groups">
                    Try another search, choose a different scan, or scan more
                    locations.
                  </Empty>
                )}
                <Pager
                  offset={offset}
                  total={groups.total}
                  size={30}
                  setOffset={setOffset}
                />
              </>
            ) : (
              noScan
            )}
          </>
        )}

        {page === "Similar Images" && (
          <>
            {!hasResults ? (
              noScan
            ) : (
              <>
                <BurstReview
                  data={bursts}
                  scanImages={Boolean(s.options.scanImages)}
                  onCompare={showCompare}
                />
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      <Images size={19} /> Visual comparison
                    </h2>
                    <span className="pill">APPROXIMATE MATCHES</span>
                  </div>
                  <p className="muted">
                    Difference hashes compare image structure across resolution
                    and compression. Scores are fingerprint similarity, not a
                    probability of identical content. These results cannot enter
                    cleanup.
                  </p>
                  <label>
                    Minimum fingerprint similarity:{" "}
                    {Math.max(threshold, s.options.similarity)}%
                    <input
                      type="range"
                      min={s.options.similarity}
                      max="100"
                      value={Math.max(threshold, s.options.similarity)}
                      onChange={(e) => {
                        setThreshold(Number(e.target.value));
                        setPairOffset(0);
                      }}
                    />
                  </label>
                  <small className="muted">
                    This scan indexed down to {s.options.similarity}%. To widen
                    the range, run a new image scan. First frames only for
                    animated or multi-page images.
                  </small>
                </section>
                {!s.options.scanImages ? (
                  <Empty icon={Images} title="Image similarity wasn’t enabled">
                    Enable “Find visually similar images” in Scan Center and run
                    a new scan.
                  </Empty>
                ) : pairs.pairs.length ? (
                  <div className="image-pairs">
                    {pairs.pairs.map((pair: any) => (
                      <section
                        className="panel"
                        key={`${pair.a.id}-${pair.b.id}`}
                      >
                        <div className="panel-heading">
                          <h2>{pair.similarity}% fingerprint similarity</h2>
                          <Button onClick={() => showCompare([pair.a, pair.b])}>
                            <Eye size={15} /> Compare
                          </Button>
                        </div>
                        <div className="pair-files">
                          {[pair.a, pair.b].map((f: any) => (
                            <div key={f.id}>
                              <MediaThumb file={f} />
                              <strong title={f.path}>{basename(f.path)}</strong>
                              <small>
                                {f.width} × {f.height} · {bytes(f.size)}
                              </small>
                              {fileTools(f)}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={Images}
                    title="No visual matches at this threshold"
                  >
                    Try a lower threshold within this scan’s range or scan
                    another image folder.
                  </Empty>
                )}
                <Pager
                  offset={pairOffset}
                  total={pairs.total}
                  size={24}
                  setOffset={setPairOffset}
                />
              </>
            )}
          </>
        )}

        {page === "Storage Analytics" && (
          <>
            {!hasResults ? (
              noScan
            ) : (
              <>
                <div className="metrics">
                  <Metric
                    label="Total indexed"
                    value={bytes(s.bytes)}
                    detail={`${s.files.toLocaleString()} files`}
                    icon={HardDrive}
                  />
                  <Metric
                    label="Duplicate storage"
                    value={bytes(s.savings)}
                    detail="Logical removable bytes"
                    icon={Copy}
                    accent
                  />
                  <Metric
                    label="Scan time"
                    value={duration(s.elapsed)}
                    detail={s.status}
                    icon={History}
                  />
                  <Metric
                    label="Hard-linked entries"
                    value={s.hardlinks.toLocaleString()}
                    detail="Excluded from duplicate savings"
                    icon={Shield}
                  />
                </div>
                <div className="two-columns">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Duplicates by file type</h2>
                    </div>
                    {s.distribution.length ? (
                      <Distribution rows={s.distribution} />
                    ) : (
                      <p className="muted">No duplicate storage found.</p>
                    )}
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>All indexed file types</h2>
                    </div>
                    <Bars rows={s.types} />
                  </section>
                </div>
                <div className="two-columns">
                  <section className="panel">
                    <h2>Duplicate copies by directory</h2>
                    <p className="muted">
                      All copies in exact groups, including retained copies.
                      This is not a savings total.
                    </p>
                    <AnalyticsBars rows={analytics.directories} />
                  </section>
                  <section className="panel">
                    <h2>Potential savings by file size</h2>
                    <AnalyticsBars rows={analytics.sizes} />
                    <h2 className="analytics-heading">
                      Duplicate copies by drive
                    </h2>
                    <AnalyticsBars rows={analytics.drives} />
                  </section>
                </div>
                <FolderMap
                  rows={analytics.directories}
                  onOpen={(directory) => {
                    navigate("Duplicate Explorer");
                    setFilters({ ...defaultFilters, directory });
                  }}
                />
                <section className="panel">
                  <h2>Scan coverage</h2>
                  {s.roots.map((p: string) => (
                    <div className="path-row" key={p}>
                      <FolderOpen size={17} />
                      {p}
                    </div>
                  ))}
                  <p className="muted">
                    Metrics describe logical file bytes in this snapshot.
                    Compression, sparse allocation, Recycle Bin contents,
                    quarantine, and later changes can affect actual free space.
                  </p>
                </section>
              </>
            )}
          </>
        )}

        {page === "Cleanup Center" && (
          <>
            {!selected.size ? (
              <Empty
                icon={ShieldCheck}
                title="Nothing selected for cleanup"
                action={
                  <Button onClick={() => navigate("Duplicate Explorer")}>
                    Explore duplicates <ArrowRight size={16} />
                  </Button>
                }
              >
                Review exact duplicate groups and select the copies you want to
                remove. At least one verified copy must remain.
              </Empty>
            ) : (
              <>
                <div className="metrics three">
                  <Metric
                    label="Selected copies"
                    value={selected.size.toLocaleString()}
                    detail="Verified again before moving"
                    icon={Files}
                  />
                  <Metric
                    label="Selected bytes"
                    value={bytes(selectedBytes)}
                    detail="Space is freed after trash is emptied"
                    icon={HardDrive}
                    accent
                  />
                  <Metric
                    label="Affected folders"
                    value={new Set(
                      [...selected.values()].map((f) =>
                        f.path.replace(/[\\/][^\\/]+$/, ""),
                      ),
                    ).size.toLocaleString()}
                    detail="Review paths below"
                    icon={FolderOpen}
                  />
                </div>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Review your cleanup</h2>
                    <Button onClick={() => setSelected(new Map())}>
                      Clear selection
                    </Button>
                  </div>
                  <div className="cleanup-list">
                    {[...selected.values()].map((f) => (
                      <div className="cleanup-file" key={f.id}>
                        <Files size={17} />
                        <span title={f.path}>{f.path}</span>
                        <b>{bytes(f.size)}</b>
                        <button
                          aria-label="Remove from selection"
                          onClick={() => toggle(f)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <label>
                    Cleanup method
                    <select
                      value={settings.cleanupMethod}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          cleanupMethod: e.target.value,
                        });
                        setPlan(null);
                      }}
                    >
                      <option value="recycle">
                        Windows Recycle Bin (default)
                      </option>
                      <option value="quarantine">
                        Verified, restorable quarantine
                      </option>
                    </select>
                  </label>
                  <div className="notice warning">
                    <AlertTriangle size={20} />
                    <span>
                      {settings.cleanupMethod === "quarantine"
                        ? "Quarantine moves files into .DaemonCore-Quarantine beside each original. It uses the same disk space and can be restored here."
                        : "Windows manages Recycle Bin recovery. This app cannot restore recycled files. Files still consume space until the Bin is emptied."}{" "}
                      Never empty trash or quarantine until you have reviewed
                      the retained copies.
                    </span>
                  </div>
                  {plan && (
                    <div className="validation-pass">
                      <ShieldCheck size={22} />
                      <span>
                        <strong>Dry run passed</strong>
                        <br />
                        {plan.count} files · {bytes(plan.bytes)} ·{" "}
                        {plan.protectedCopies} live copies protected. No files
                        have moved.
                      </span>
                    </div>
                  )}
                  <div className="row">
                    <Button
                      disabled={working || active}
                      onClick={() =>
                        run(async () =>
                          setPlan(
                            await window.hunter.call("previewCleanup", [
                              ...selected.keys(),
                            ]),
                          ),
                        )
                      }
                    >
                      <ShieldCheck size={16} /> Validate dry run
                    </Button>
                    <Button
                      kind="primary"
                      disabled={!plan || working || active}
                      onClick={() =>
                        run(async () => {
                          const result = await window.hunter.call(
                            "executeCleanup",
                            {
                              ids: [...selected.keys()],
                              method: settings.cleanupMethod,
                            },
                          );
                          if (result.length) {
                            const next = new Map(selected);
                            for (const r of result)
                              if (
                                ["recycled", "quarantined"].includes(r.status)
                              ) {
                                const f = [...next.values()].find(
                                  (f) => f.path === r.path,
                                );
                                if (f) next.delete(f.id);
                              }
                            setSelected(next);
                            setPlan(null);
                            setToast(
                              result.some((r: any) => r.status === "review")
                                ? "Cleanup stopped. Review the operation journal."
                                : "Cleanup recorded. Review retained copies before emptying trash.",
                            );
                            await load(currentId);
                            setRevision((v) => v + 1);
                          }
                        })
                      }
                    >
                      <Trash2 size={16} /> Review Windows confirmation
                    </Button>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {page === "Recovery Center" && (
          <>
            <div className="notice">
              <ShieldCheck size={20} />
              <span>
                Only quarantine operations can be restored here. Recycled files
                are managed by the Windows Recycle Bin. Recovery journals are
                preserved when scan history is cleared.
              </span>
            </div>
            {state.operations.length ? (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Operation journal</h2>
                  <span className="subtle">LATEST 200 OPERATIONS</span>
                </div>
                {state.operations.map((op: any) => (
                  <div className="operation" key={op.id}>
                    <span className={`status ${op.status}`}>{op.status}</span>
                    <div>
                      <strong title={op.original}>{op.original}</strong>
                      <small>
                        {date(op.created)} · {bytes(op.size)} · {op.method}
                      </small>
                      {op.message && <p className="muted">{op.message}</p>}
                      {op.destination && (
                        <small title={op.destination}>
                          Quarantine: {op.destination}
                        </small>
                      )}
                    </div>
                    {["quarantined", "prepared", "review"].includes(
                      op.status,
                    ) && op.destination ? (
                      <Button
                        disabled={working || active}
                        onClick={() =>
                          run(async () => {
                            await window.hunter.call("restore", op.id);
                            setToast(
                              "File restored without overwriting an existing path. Rescan before further cleanup.",
                            );
                            await load(currentId);
                          })
                        }
                      >
                        <RotateCcw size={15} /> Restore
                      </Button>
                    ) : (
                      <small className="muted">
                        {op.status === "recycled"
                          ? "Use Windows Recycle Bin"
                          : op.status === "restored"
                            ? "Restored · rescan to refresh"
                            : "Manual review"}
                      </small>
                    )}
                  </div>
                ))}
              </section>
            ) : (
              <Empty icon={RotateCcw} title="Your recovery journal is clear">
                Completed cleanup operations will appear here with their real
                outcome and recovery options.
              </Empty>
            )}
          </>
        )}

        {page === "Scan History" && (
          <>
            {state.history.length ? (
              <>
                <div className="toolbar">
                  <span className="muted">
                    Latest {state.history.length} scans · all stored locally
                  </span>
                  <Button
                    disabled={working || active}
                    onClick={() =>
                      run(async () => {
                        const data = await window.hunter.call("clearHistory");
                        apply(data);
                        setScanId(undefined);
                        viewedScan.current = undefined;
                        setSelected(new Map());
                        setCompare([]);
                      })
                    }
                  >
                    <Trash2 size={15} /> Clear unused history
                  </Button>
                </div>
                {compare.length === 2 && (
                  <section className="panel">
                    <h2>Historical comparison</h2>
                    <div className="comparison-history">
                      {compare.map((id) => {
                        const h = state.history.find((h: any) => h.id === id);
                        return (
                          <div key={id}>
                            <strong>{date(h.started)}</strong>
                            <p>
                              {h.files.toLocaleString()} files ·{" "}
                              {bytes(h.bytes)} indexed
                            </p>
                            <p>
                              {h.groups_count.toLocaleString()} duplicate groups
                              · {bytes(h.savings)} potential savings at scan
                              completion
                            </p>
                            <small>{h.roots.join(", ")}</small>
                          </div>
                        );
                      })}
                    </div>
                    <p className="muted">
                      These are independent snapshots. Differences in scope or
                      scan settings affect the totals.
                    </p>
                  </section>
                )}
                <section className="panel">
                  {state.history.map((h: any) => (
                    <div className="history-row" key={h.id}>
                      <input
                        aria-label={`Compare scan ${date(h.started)}`}
                        type="checkbox"
                        checked={compare.includes(h.id)}
                        onChange={() =>
                          setCompare((old) =>
                            old.includes(h.id)
                              ? old.filter((id) => id !== h.id)
                              : [...old.slice(-1), h.id],
                          )
                        }
                      />
                      <span className="activity-icon">
                        <ScanLine size={20} />
                      </span>
                      <div>
                        <strong>{h.roots.join(", ")}</strong>
                        <small>
                          {date(h.started)} · {duration(h.elapsed)} ·{" "}
                          {h.files.toLocaleString()} files
                        </small>
                      </div>
                      <span className={`status ${h.status}`}>{h.status}</span>
                      <Button
                        disabled={active || working}
                        onClick={() => openScan(h.id)}
                      >
                        Open
                      </Button>
                      <Button
                        disabled={active || working}
                        onClick={() => {
                          setRoots(h.roots);
                          setSettings({ ...settings, ...h.options });
                          setPage("Scan Center");
                        }}
                      >
                        <RefreshCw size={14} /> Rescan
                      </Button>
                    </div>
                  ))}
                </section>
              </>
            ) : (
              noScan
            )}
          </>
        )}

        {page === "Settings" && (
          <>
            <div className="two-columns settings-columns">
              <section className="panel">
                <h2>
                  <SlidersHorizontal size={18} /> Performance & matching
                </h2>
                <label>
                  Concurrent file reads
                  <select
                    value={settings.concurrency}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        concurrency: Number(e.target.value),
                      })
                    }
                  >
                    {[1, 2, 3, 4, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                        {n === 2 ? " (recommended)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Image similarity threshold: {settings.similarity}%
                  <input
                    type="range"
                    min="70"
                    max="100"
                    value={settings.similarity}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        similarity: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <p className="muted">
                  Image comparison is limited to 20,000 images and 100,000 pairs
                  per scan. Narrow large image collections to keep comparison
                  bounded.
                </p>
                <label>
                  Keep recommendation preference
                  <select
                    value={settings.keepPolicy}
                    onChange={(e) =>
                      setSettings({ ...settings, keepPolicy: e.target.value })
                    }
                  >
                    <option value="preferred">
                      Preferred folder, then shortest path
                    </option>
                    <option value="oldest">
                      Preferred folder, then oldest modified
                    </option>
                    <option value="newest">
                      Preferred folder, then newest modified
                    </option>
                  </select>
                </label>
                <Toggle
                  label="Scan completion notifications"
                  checked={settings.notifications}
                  onChange={(v) =>
                    setSettings({ ...settings, notifications: v })
                  }
                />
                <Toggle
                  label="Reduce motion"
                  checked={settings.reducedMotion}
                  onChange={(v) =>
                    setSettings({ ...settings, reducedMotion: v })
                  }
                />
              </section>
              <section className="panel">
                <h2>
                  <Shield size={18} /> Folder rules
                </h2>
                {[
                  ["exclusions", "Exclude from scanning"],
                  ["protectedFolders", "Protect from cleanup"],
                  ["preferredFolders", "Prefer when recommending a copy"],
                ].map(([key, label]) => (
                  <div className="folder-rule" key={key}>
                    <div className="panel-heading">
                      <h3>{label}</h3>
                      <Button
                        onClick={() =>
                          run(async () => {
                            const folders =
                              await window.hunter.call("chooseFolders");
                            setSettings({
                              ...settings,
                              [key]: [
                                ...new Set([...settings[key], ...folders]),
                              ],
                            });
                          })
                        }
                      >
                        <FolderPlus size={14} /> Add
                      </Button>
                    </div>
                    {settings[key].length ? (
                      settings[key].map((p: string) => (
                        <div className="path-row" key={p}>
                          <span title={p}>{p}</span>
                          <button
                            aria-label={`Remove rule ${p}`}
                            onClick={() =>
                              setSettings({
                                ...settings,
                                [key]: settings[key].filter(
                                  (v: string) => v !== p,
                                ),
                              })
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="muted">No custom folders.</p>
                    )}
                  </div>
                ))}
                <small className="muted">
                  Windows, Program Files, ProgramData, the app database, and
                  quarantine folders have built-in safeguards.
                </small>
              </section>
            </div>
            <section className="panel privacy-panel">
              <ShieldCheck size={25} />
              <div>
                <h2>Local means local.</h2>
                <p>
                  File analysis, fingerprints, scan history, and cleanup
                  journals stay on this computer. No accounts, analytics, or
                  file uploads.
                </p>
                <small>
                  Microsoft Store ID: 9NS89BZQKWT4 · Store certification has not
                  been completed.
                </small>
              </div>
            </section>
            <div className="row">
              <Button
                kind="primary"
                disabled={working || active}
                onClick={() =>
                  run(async () => {
                    const saved = await window.hunter.call(
                      "saveSettings",
                      settings,
                    );
                    setSettings(saved);
                    setState({ ...state, settings: saved });
                    setToast("Preferences saved on this computer.");
                  })
                }
              >
                <Check size={16} /> Save preferences
              </Button>
              <Button
                onClick={() => {
                  setSettings(state.settings);
                  setToast("Restored the last saved preferences.");
                }}
              >
                Discard unsaved changes
              </Button>
            </div>
          </>
        )}
        <footer>
          <span>
            <ShieldCheck size={12} /> All analysis stays on your computer
          </span>
          <span>
            {active ? "SCAN IN PROGRESS" : "WORKSPACE READY"}{" "}
            <span className="footer-dot" />
          </span>
        </footer>
      </main>
      {context && (
        <div
          className="context-menu"
          role="menu"
          aria-label="File actions"
          style={{ left: context.x, top: context.y }}
        >
          <button
            role="menuitem"
            onClick={() => action(context.file, "reveal")}
          >
            <FolderOpen size={15} /> Reveal in Explorer
          </button>
          <button role="menuitem" onClick={() => action(context.file, "copy")}>
            <Copy size={15} /> Copy path
          </button>
          <button role="menuitem" onClick={() => action(context.file, "open")}>
            <ArrowUpRight size={15} /> Open with Windows…
          </button>
        </div>
      )}
      {inspector && (
        <FileInspector
          data={inspector}
          selected={selected.has(inspector.file.id)}
          onClose={() => setInspector(null)}
          onToggle={() => toggle(inspector.file)}
          onAction={(command) => action(inspector.file, command)}
          isPreferred={settings.preferredFolders.some(
            (folder: string) =>
              folder.toLowerCase() ===
              String(inspector.file.directory || "").toLowerCase(),
          )}
          onPreferFolder={() =>
            run(async () => {
              const folder = inspector.file.directory;
              if (!folder)
                throw new Error("This file has no scanned folder path.");
              const exists = settings.preferredFolders.some(
                (item: string) => item.toLowerCase() === folder.toLowerCase(),
              );
              if (!exists && settings.preferredFolders.length >= 100)
                throw new Error("You can save up to 100 preferred folders.");
              const updated = {
                ...settings,
                preferredFolders: exists
                  ? settings.preferredFolders.filter(
                      (item: string) =>
                        item.toLowerCase() !== folder.toLowerCase(),
                    )
                  : [...settings.preferredFolders, folder],
              };
              await window.hunter.call("saveSettings", updated);
              setSettings(updated);
              setToast(
                exists
                  ? "Folder preference removed."
                  : "We’ll recommend keeping copies in this folder.",
              );
            })
          }
        />
      )}
      {commandOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setCommandOpen(false)}
        />
      )}
      {toast && (
        <div
          className={`toast ${toastIsError ? "error" : "success"}`}
          role="status"
        >
          {toastIsError ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {working && (
        <div className="working" role="status">
          <LoaderCircle className="spin" size={15} /> Working…
        </div>
      )}
      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <section
            className="modal media-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Media comparison"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <h2>Media inspection</h2>
              <Button onClick={() => setPreview(null)}>
                <X size={16} /> Close
              </Button>
            </div>
            <ComparisonStage
              files={preview.files}
              urls={preview.urls}
              tools={fileTools}
              onError={message}
            />
            <p className="muted">
              Visual previews do not prove equality. Exact groups are verified
              by the scan engine.
            </p>
          </section>
        </div>
      )}
      {errorList && (
        <div className="modal-backdrop">
          <section
            className="modal issue-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Scan issues"
          >
            <div className="panel-heading">
              <div>
                <h2>Scan diagnostics</h2>
                <p className="muted">
                  {errorList.total.toLocaleString()} events ·{" "}
                  {errorList.matching.toLocaleString()} shown by this filter.
                  Diagnostics describe scan conditions; they are not a cleanup
                  list.
                </p>
              </div>
              <Button onClick={() => setErrorList(null)}>
                <X size={16} /> Close
              </Button>
            </div>
            <div className="issue-summary">
              {errorList.counts.slice(0, 4).map((entry: any) => (
                <div key={entry.code}>
                  <strong>{entry.count.toLocaleString()}</strong>
                  <span>{entry.code}</span>
                </div>
              ))}
            </div>
            <div className="issue-toolbar">
              <label>
                ISSUE TYPE
                <select
                  aria-label="Filter scan diagnostics by issue type"
                  value={errorFilter}
                  onChange={(event) =>
                    run(() =>
                      loadIssues(errorList.scanId, 0, event.target.value),
                    )
                  }
                >
                  <option value="">All issue types</option>
                  {errorList.counts.map((entry: any) => (
                    <option value={entry.code} key={entry.code}>
                      {entry.code} · {entry.count.toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <div className="issue-actions">
                <Button
                  disabled={!errorList.rows.length}
                  onClick={() => {
                    const visible = errorList.rows.map((row: any) => row.id);
                    const allSelected = visible.every((id: number) =>
                      selectedIssues.has(id),
                    );
                    setSelectedIssues(
                      allSelected ? new Set() : new Set(visible),
                    );
                  }}
                >
                  {errorList.rows.every((row: any) =>
                    selectedIssues.has(row.id),
                  )
                    ? "Clear page"
                    : "Select page"}
                </Button>
                <Button
                  disabled={!selectedIssues.size || working}
                  onClick={copySelectedIssues}
                >
                  <Copy size={14} /> Copy paths ({selectedIssues.size})
                </Button>
                <Button
                  disabled={!selectedIssues.size || working}
                  onClick={() => excludeSelectedIssues(false)}
                >
                  Exclude files next scan
                </Button>
                <Button
                  disabled={!selectedIssues.size || working}
                  onClick={() => excludeSelectedIssues(true)}
                >
                  Exclude folders next scan
                </Button>
              </div>
            </div>
            {errorFilter && errorList.commonFolder && (
              <div className="issue-common-folder">
                <div>
                  <strong>These diagnostics cluster in one folder</strong>
                  <span title={errorList.commonFolder}>
                    {errorList.commonFolder}
                  </span>
                  <small>
                    Excluding it skips this folder on future scans. Existing
                    scan results and files are left untouched.
                  </small>
                </div>
                <Button
                  disabled={
                    working ||
                    settings.exclusions.includes(errorList.commonFolder)
                  }
                  onClick={() =>
                    saveIssueExclusions([errorList.commonFolder], "folder")
                  }
                >
                  {settings.exclusions.includes(errorList.commonFolder)
                    ? "Already excluded"
                    : "Exclude folder next scan"}
                </Button>
              </div>
            )}
            <div className="issue-list">
              {errorList.rows.map((issue: any) => (
                <div className="issue-row" key={issue.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedIssues.has(issue.id)}
                      onChange={() =>
                        setSelectedIssues((old) => {
                          const next = new Set(old);
                          if (next.has(issue.id)) next.delete(issue.id);
                          else next.add(issue.id);
                          return next;
                        })
                      }
                    />
                    <span>
                      <strong>{issue.code}</strong>
                      <small title={issue.path}>{issue.path}</small>
                    </span>
                  </label>
                  <Button
                    title="Reveal this path in File Explorer"
                    ariaLabel={`Reveal ${issue.path} in File Explorer`}
                    onClick={() =>
                      run(async () => {
                        await window.hunter.call("revealIssue", {
                          scanId: errorList.scanId,
                          id: issue.id,
                        });
                      })
                    }
                  >
                    <FolderOpen size={14} /> Reveal
                  </Button>
                </div>
              ))}
              {!errorList.rows.length && (
                <p className="muted issue-empty">
                  No diagnostics match this filter.
                </p>
              )}
            </div>
            <div className="issue-pagination">
              <span>
                {errorList.matching
                  ? `${errorOffset + 1}–${Math.min(errorOffset + errorList.rows.length, errorList.matching)} of ${errorList.matching.toLocaleString()}`
                  : "No results"}
              </span>
              <div>
                <Button
                  disabled={errorOffset === 0 || working}
                  onClick={() =>
                    run(() =>
                      loadIssues(
                        errorList.scanId,
                        Math.max(0, errorOffset - 100),
                        errorFilter,
                      ),
                    )
                  }
                >
                  <ChevronLeft size={15} /> Previous
                </Button>
                <Button
                  disabled={errorOffset + 100 >= errorList.matching || working}
                  onClick={() =>
                    run(() =>
                      loadIssues(
                        errorList.scanId,
                        errorOffset + 100,
                        errorFilter,
                      ),
                    )
                  }
                >
                  Next <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <AlertTriangle size={35} />
        <h1>Unable to display the workspace</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>Reload the workspace</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
