import englishDataUrl from "@tesseract.js-data/eng/4.0.0/eng.traineddata.gz?url";
import tesseractCoreUrl from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import tesseractWorkerUrl from "tesseract.js/dist/worker.min.js?url";

export const MAX_CONTEXT_CHARS = 100000;
export const MAX_FILES = 10;
export const MAX_TOTAL_FILE_BYTES = 25 * 1024 * 1024;

const MAX_ARCHIVE_ENTRIES = 40;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
const MAX_PDF_PAGES = 100;

function extensionOf(name) {
  return name.split(".").pop().toLowerCase();
}

function isSupported(name) {
  return ["txt", "md", "pdf", "docx", "png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(
    extensionOf(name)
  );
}

async function getOcrWorker(onProgress) {
  const [{ createWorker }, dataResponse] = await Promise.all([
    import("tesseract.js"),
    fetch(englishDataUrl),
  ]);
  if (!dataResponse.ok) {
    throw new Error(`Could not load the local OCR language data (status ${dataResponse.status}).`);
  }
  const data = new Uint8Array(await dataResponse.arrayBuffer());
  return createWorker(
    [{ code: "eng", data }],
    1,
    {
      workerPath: tesseractWorkerUrl,
      corePath: tesseractCoreUrl,
      workerBlobURL: false,
      logger: ({ status, progress }) => onProgress(status, progress),
    },
  );
}

async function validateArchive(file, JSZip) {
  if (file.size > MAX_TOTAL_FILE_BYTES) {
    throw new Error(`${file.name} is larger than the 25 MB upload limit.`);
  }
  const archive = await JSZip.loadAsync(file);
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`${file.name} contains more than ${MAX_ARCHIVE_ENTRIES} files.`);
  }
  const expandedSize = entries.reduce(
    (total, entry) => total + (entry._data?.uncompressedSize ?? MAX_ARCHIVE_UNCOMPRESSED_BYTES),
    0,
  );
  if (expandedSize > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
    throw new Error(`${file.name} expands beyond the 30 MB archive limit.`);
  }
  return { archive, entries };
}

async function extractPdf(file, getWorker, onProgress) {
  const pdfjs = await import("pdfjs-dist");
  const pdfWorkerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const sections = [];
  let truncated = document.numPages > MAX_PDF_PAGES;

  try {
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, MAX_PDF_PAGES); pageNumber += 1) {
      onProgress(`Reading ${file.name} (page ${pageNumber}/${document.numPages})`);
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").trim();
      if (text) {
        sections.push(text);
      } else {
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = window.document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare a scanned PDF page for OCR.");
        await page.render({ canvasContext: context, viewport }).promise;
        const result = await (await getWorker()).recognize(canvas);
        if (result.data.text.trim()) sections.push(result.data.text.trim());
      }
      if (sections.join("\n\n").length > MAX_CONTEXT_CHARS) {
        truncated = true;
        break;
      }
    }
  } finally {
    await document.destroy();
  }

  return { text: sections.join("\n\n").slice(0, MAX_CONTEXT_CHARS), truncated };
}

async function extractSupportedFile(file, getWorker, onProgress) {
  const extension = extensionOf(file.name);
  if (["txt", "md"].includes(extension)) {
    return { text: (await file.text()).slice(0, MAX_CONTEXT_CHARS), truncated: file.size > MAX_CONTEXT_CHARS };
  }
  if (extension === "pdf") return extractPdf(file, getWorker, onProgress);
  if (extension === "docx") {
    const JSZip = (await import("jszip")).default;
    await validateArchive(file, JSZip);
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: value.slice(0, MAX_CONTEXT_CHARS), truncated: value.length > MAX_CONTEXT_CHARS };
  }
  if (["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(extension)) {
    onProgress(`Recognizing text in ${file.name}`);
    const result = await (await getWorker()).recognize(file);
    return { text: result.data.text.slice(0, MAX_CONTEXT_CHARS), truncated: result.data.text.length > MAX_CONTEXT_CHARS };
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

export async function extractContextFiles(files, onProgress = () => {}) {
  files = Array.from(files || []);
  const JSZip = await import("jszip").then((module) => module.default);
  const documents = [];
  const errors = [];
  let worker;
  let contextChars = 0;
  let truncated = false;
  let extractedCount = 0;
  const getWorker = async () => {
    if (!worker) worker = await getOcrWorker(onProgress);
    return worker;
  };

  async function extractOne(file, sourceName = file.name, sourceFile = file.name) {
    if (contextChars >= MAX_CONTEXT_CHARS || extractedCount >= MAX_FILES) {
      truncated = true;
      return;
    }
    try {
      const extracted = await extractSupportedFile(file, getWorker, onProgress);
      const remaining = MAX_CONTEXT_CHARS - contextChars;
      if (extracted.text.trim()) {
        const text = extracted.text.slice(0, remaining);
        documents.push({
          name: sourceName,
          text,
          size: file.size,
          sourceName: sourceFile,
          sourceSize: files.find((item) => item.name === sourceFile)?.size ?? file.size,
        });
        extractedCount += 1;
        contextChars += text.length;
      } else {
        errors.push(`${sourceName}: no readable text was found.`);
      }
      if (extracted.truncated || extracted.text.length > remaining) {
        truncated = true;
      }
    } catch (error) {
      errors.push(`${sourceName}: ${error.message}`);
    }
  }

  try {
    for (const file of files) {
      if (contextChars >= MAX_CONTEXT_CHARS) {
        truncated = true;
        break;
      }
      if (extractedCount >= MAX_FILES) {
        truncated = true;
        break;
      }
      if (extensionOf(file.name) !== "zip") {
        await extractOne(file);
        continue;
      }

      try {
        const { archive, entries } = await validateArchive(file, JSZip);
        const supported = entries.filter((entry) => isSupported(entry.name));
        if (!supported.length) {
          errors.push(`${file.name}: no supported text, PDF, DOCX, or image files were found.`);
          continue;
        }
        for (const entry of supported) {
          if (contextChars >= MAX_CONTEXT_CHARS) {
            truncated = true;
            break;
          }
          if (extractedCount >= MAX_FILES) {
            truncated = true;
            break;
          }
          const extractedFile = new File([await archive.file(entry.name).async("uint8array")], entry.name);
          await extractOne(extractedFile, `${file.name} / ${entry.name}`, file.name);
        }
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }
  } finally {
    if (worker) await worker.terminate();
  }

  return { documents, errors, truncated };
}

export function buildContext(documents) {
  let context = "";
  let truncated = false;
  for (const document of documents) {
    const section = `\n\n[Attached file: ${document.name}]\n${document.text}`;
    const remaining = MAX_CONTEXT_CHARS - context.length;
    if (section.length > remaining) {
      context += section.slice(0, Math.max(remaining, 0));
      truncated = true;
      break;
    }
    context += section;
  }
  return { context: context.trim(), truncated };
}
