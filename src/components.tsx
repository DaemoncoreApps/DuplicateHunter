import React, { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ScanLine,
  HardDrive,
  Files,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  CheckCheck,
  Eye,
  Images,
  LoaderCircle,
} from "lucide-react";
import { bytes, date, basename, colors } from "./format";
export function Button({
  children,
  onClick,
  kind = "",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      className={`button ${kind}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
export function Empty({
  icon: Icon = ScanLine,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={32} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <div className="metric-top">
        {label}
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function AnalyticsBars({ rows }: { rows: any[] }) {
  const max = Math.max(1, ...rows.map((r) => r.bytes));
  return (
    <div className="bars analytics-bars">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div>
            <span title={r.label}>
              <i style={{ background: colors[i % colors.length] }} />
              {r.label}
            </span>
            <strong>{bytes(r.bytes)}</strong>
          </div>
          <div className="bar-track">
            <i
              style={{
                width: `${(100 * r.bytes) / max}%`,
                background: colors[i % colors.length],
              }}
            />
          </div>
          <small>
            {r.count.toLocaleString()}{" "}
            {r.label.includes("MB") || r.label.includes("GB")
              ? "groups"
              : "files"}
          </small>
        </div>
      ))}
    </div>
  );
}
export function Toggle({
  label,
  detail,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle">
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail && detail}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export function Pager({
  offset,
  total,
  size,
  setOffset,
}: {
  offset: number;
  total: number;
  size: number;
  setOffset: (n: number) => void;
}) {
  return total > size ? (
    <div className="pager">
      <Button
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - size))}
      >
        Previous
      </Button>
      <span>
        {offset + 1}–{Math.min(offset + size, total)} of{" "}
        {total.toLocaleString()}
      </span>
      <Button
        disabled={offset + size >= total}
        onClick={() => setOffset(offset + size)}
      >
        Next
      </Button>
    </div>
  ) : null;
}
export function Bars({ rows }: { rows: any[] }) {
  const max = Math.max(1, ...rows.map((r) => r.bytes));
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div key={r.ext}>
          <div>
            <span>
              <i style={{ background: colors[i % colors.length] }} />
              {r.ext || "No extension"}
            </span>
            <strong>{bytes(r.bytes)}</strong>
          </div>
          <div className="bar-track">
            <i
              style={{
                width: `${(100 * r.bytes) / max}%`,
                background: colors[i % colors.length],
              }}
            />
          </div>
          <small>{r.count.toLocaleString()} files</small>
        </div>
      ))}
    </div>
  );
}
export function Distribution({ rows }: { rows: any[] }) {
  const total = rows.reduce((n, r) => n + r.bytes, 0);
  let cumulative = 0;
  const stops = rows
    .map((r, i) => {
      const start = cumulative;
      cumulative += (100 * r.bytes) / (total || 1);
      return `${colors[i % colors.length]} ${start}% ${cumulative}%`;
    })
    .join(",");
  return (
    <div className="distribution">
      <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
        <div>
          <strong>{bytes(total)}</strong>
          <small>duplicate bytes</small>
        </div>
      </div>
      <div className="legend">
        {rows.slice(0, 6).map((r, i) => (
          <div key={r.ext}>
            <i style={{ background: colors[i % colors.length] }} />
            <span>{r.ext || "No extension"}</span>
            <strong>{bytes(r.bytes)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
export function DrivePanel({ drives }: { drives: any[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          <HardDrive size={18} /> Connected storage
        </h2>
        <span className="subtle">ACTUAL DISK CAPACITY</span>
      </div>
      {drives.length ? (
        <div className="drives">
          {drives.map((d) => (
            <div className="drive" key={d.root}>
              <div>
                <HardDrive size={20} />
                <strong>{d.root}</strong>
                <small>{bytes(d.free)} free</small>
              </div>
              <div className="drive-track">
                <span
                  style={{
                    width: `${(100 * (d.total - d.free)) / (d.total || 1)}%`,
                  }}
                />
              </div>
              <small>
                {bytes(d.total - d.free)} used of {bytes(d.total)}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No accessible drive capacity information.</p>
      )}
    </section>
  );
}
export function Group({
  group: g,
  selected,
  toggle,
  selectGroup,
  tools,
  compare,
}: {
  group: any;
  selected: Map<number, any>;
  toggle: (f: any) => void;
  selectGroup: (g: any) => void;
  tools: (f: any) => React.ReactNode;
  compare: (files: any[]) => void;
}) {
  const [expanded, setExpanded] = useState(false),
    [offset, setOffset] = useState(0);
  return (
    <section className="group">
      <button
        className="group-heading"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span className="file-tile">
          <Files size={20} />
        </span>
        <span>
          <strong>{basename(g.first_path)}</strong>
          <small>
            {g.copies.toLocaleString()} copies · {bytes(g.size)} each
          </small>
        </span>
        <span className="verified">
          <ShieldCheck size={13} /> EXACT MATCH
        </span>
        <b>
          {bytes(g.savings)}
          <small>potential savings</small>
        </b>
      </button>
      {expanded && (
        <div className="group-body">
          <div className="group-explanation">
            <span>
              <ShieldCheck size={15} />
              {g.keep.reason}
            </span>
            <Button onClick={() => selectGroup(g)}>
              <CheckCheck size={14} /> Select other copies
            </Button>
          </div>
          <code className="checksum">SHA-256 {g.hash}</code>
          {g.files.slice(offset, offset + 50).map((f: any) => (
            <div
              className={`file-row ${selected.has(f.id) ? "selected" : ""}`}
              key={f.id}
              data-file-id={f.id}
              tabIndex={0}
            >
              <input
                type="checkbox"
                aria-label={`Select ${f.path}`}
                checked={selected.has(f.id)}
                onChange={() => toggle(f)}
              />
              <div className="file-description">
                <strong title={f.path}>
                  {f.path}
                  {f.id === g.keep.id && (
                    <span className="keep-label">SUGGESTED KEEP</span>
                  )}
                </strong>
                <small>
                  {bytes(f.size)} · Modified{" "}
                  {date(new Date(f.mtime).toISOString())}
                </small>
              </div>
              {tools(f)}
            </div>
          ))}
          {g.truncated && (
            <p className="muted">
              This group has more than 1,000 copies. Display and selection are
              limited to 1,000; use a narrower scan to inspect all copies.
            </p>
          )}
          <Pager
            offset={offset}
            total={g.files.length}
            size={50}
            setOffset={setOffset}
          />
          {/\.(jpg|jpeg|png|webp|gif|bmp|mp4|webm|mov)$/i.test(
            g.first_path,
          ) && (
            <Button onClick={() => compare(g.files.slice(0, 2))}>
              <Eye size={15} /> Compare first two copies
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
export function MediaThumb({ file }: { file: any }) {
  const [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    window.hunter
      .call("fileAction", { id: file.id, action: "preview" })
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => setFailed(true));
    return () => {
      active = false;
    };
  }, [file.id]);
  return failed ? (
    <div className="thumb-failed">
      <Images size={28} /> Preview unavailable
    </div>
  ) : url ? (
    <img
      className="media-thumb"
      src={url}
      alt={basename(file.path)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="thumb-failed">
      <LoaderCircle className="spin" size={22} />
    </div>
  );
}
