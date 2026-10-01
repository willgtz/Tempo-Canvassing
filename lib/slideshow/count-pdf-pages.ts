// Client-only — parses just the PDF's structure to get the page count,
// no rendering involved, so this is cheap even for a large file. Used
// at upload time to decide how many slide rows a PDF expands into (one
// per page, per William's choice).
export async function countPdfPages(file: File): Promise<number> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  loadingTask.destroy();
  return numPages;
}
