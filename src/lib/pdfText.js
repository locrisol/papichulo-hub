// Getting the words, and where they sit, out of a PDF.
//
// **The documents are text, not scans.** That is the single fact the whole
// invoice feature rests on: the text layer is real, so this reads characters
// rather than pixels, and no AI is involved in the supplier that is about 90%
// of what they buy. It parses the way the till's export does in the Timesheet:
// locally, deterministically, with a test pinned to a fixture.
//
// It runs in the browser, so an invoice never leaves the machine it was
// downloaded onto.
//
// **The coordinates are the point.** A PDF has no columns and no rows: it has
// lettering at positions. Flattening a page to a string and running regular
// expressions over it works until a description happens to contain a number, or
// a supplier moves a column, and then it is quietly wrong rather than broken.
// Everything above this file works on x and y instead.
//
// pdfjs is loaded on demand. It is most of a megabyte and only the import
// screen ever needs it, so it is not going in the bundle that has to arrive
// before somebody can sign in.

// y counted from the top of the page, not the bottom.
//
// PDF space has its origin at the bottom left and counts upward, which means
// sorting rows by y reads a page backwards. Flipping it here means everything
// above can say "the next row down" and mean it.
export function itemsFromPage(content, viewportHeight, page) {
    const out = []
    for (const item of content?.items || []) {
        const text = String(item.str ?? '')
        if (!text.trim()) continue
        const [, , , , x, y] = item.transform
        out.push({
            page,
            str: text,
            x,
            y: viewportHeight - y,
            width: item.width || 0,
            height: item.height || 0,
        })
    }
    return out
}

// Everything on every page, in one list.
//
// The page number is carried on each item rather than the list being nested,
// because a line table repeats its heading on each page and the parser wants to
// walk the whole document in order regardless of where a page break landed.
export async function readPdfText(file, load = loadPdfjs) {
    const pdfjs = await load()
    const bytes = await file.arrayBuffer()
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes) })
    const doc = await task.promise

    try {
        const items = []
        for (let page = 1; page <= doc.numPages; page++) {
            const sheet = await doc.getPage(page)
            const viewport = sheet.getViewport({ scale: 1 })
            const content = await sheet.getTextContent()
            items.push(...itemsFromPage(content, viewport.height, page))
        }
        return { pages: doc.numPages, items }
    } finally {
        // The worker is a real thread and it does not go away on its own.
        // Twenty invoices in one batch is twenty of them otherwise.
        await doc.destroy()
    }
}

// Kept apart so the reader above can be tested without a PDF engine, and so the
// dynamic import happens once rather than per file.
let pending = null

export function loadPdfjs() {
    if (!pending) {
        pending = (async () => {
            const pdfjs = await import('pdfjs-dist')
            const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
            pdfjs.GlobalWorkerOptions.workerSrc = worker.default
            return pdfjs
        })()
    }
    return pending
}
