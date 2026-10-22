export const bytes = (value = 0) => {
  if (!value) return "0 B";
  const i = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** i).toLocaleString(undefined, { maximumFractionDigits: i ? 2 : 0 })} ${["B", "KB", "MB", "GB", "TB"][i]}`;
};
export const date = (value: string) => new Date(value).toLocaleString();
export const duration = (value = 0) => {
  const s = Math.floor(value / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};
export const basename = (p: string) => p.split(/[\\/]/).at(-1) || p;
export const colors = [
  "#ed3549",
  "#a7334d",
  "#f06a58",
  "#7c4b78",
  "#586479",
  "#bd9970",
];
