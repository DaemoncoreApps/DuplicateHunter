function findBursts(db, scanId) {
  const photos = db
    .prepare(
      "SELECT id,path,size,mtime,ext,directory,width,height FROM files WHERE scan_id=? AND image_hash IS NOT NULL AND state='present' ORDER BY directory,mtime,id LIMIT 5001",
    )
    .all(scanId);
  const truncated = photos.length > 5000;
  const clusters = [];
  let run = [];
  const flush = () => {
    if (run.length >= 3) {
      const ranked = [...run].sort(
        (a, b) =>
          (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0) ||
          b.size - a.size,
      );
      clusters.push({
        directory: run[0].directory,
        started: run[0].mtime,
        ended: run.at(-1).mtime,
        files: run,
        largest: ranked[0],
      });
    }
    run = [];
  };
  for (const photo of photos.slice(0, 5000)) {
    const previous = run.at(-1);
    if (
      previous &&
      (photo.directory !== previous.directory ||
        photo.mtime - run[0].mtime > 90_000)
    )
      flush();
    run.push(photo);
  }
  flush();
  return {
    totalImages: Math.min(photos.length, 5000),
    truncated,
    bursts: clusters
      .sort((a, b) => b.files.length - a.files.length || b.ended - a.ended)
      .slice(0, 24),
  };
}
module.exports = { findBursts };
