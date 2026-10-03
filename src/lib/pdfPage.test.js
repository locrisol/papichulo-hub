import { describe, it, expect, vi } from 'vitest'
import { loadJsPdf, LOGO_WIDTH, LOGO_HEIGHT, rgb, letterhead, footers } from '@/lib/pdfPage'

// A stand in for jsPDF that writes nothing and remembers what it was asked,
// with the page it was on for each piece of text.
function fakePdf(pages = 1) {
    let page = 1
    const written = []
    const pdf = {
        internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
        getNumberOfPages: vi.fn(() => pages),
        setPage: vi.fn(n => { page = n }),
        text: vi.fn((words, x, y) => { written.push({ page, words, x, y }) }),
        setFont: vi.fn(),
        setFontSize: vi.fn(),
        setTextColor: vi.fn(),
        setDrawColor: vi.fn(),
        setLineWidth: vi.fn(),
        line: vi.fn(),
        addImage: vi.fn(),
        splitTextToSize: vi.fn(words => [words]),
        getTextWidth: vi.fn(words => words.length),
    }
    return { pdf, written }
}

describe('loadJsPdf', () => {
    // Two papers asked for at once share one fetch.
    it('hands back the same promise every time', () => {
        expect(loadJsPdf()).toBe(loadJsPdf())
    })

    it('resolves to the jsPDF class', async () => {
        const JsPdf = await loadJsPdf()
        expect(typeof JsPdf).toBe('function')
    })

    // A phone that lost signal gets another go when the button is pressed again.
    it('tries again after a fetch that failed', async () => {
        let calls = 0
        vi.resetModules()
        vi.doMock('jspdf', () => {
            calls += 1
            if (calls === 1) throw new Error('offline')
            return { default: function JsPdf() {} }
        })
        try {
            const { loadJsPdf: fresh } = await import('@/lib/pdfPage')
            await expect(fresh()).rejects.toThrow()
            const JsPdf = await fresh()
            expect(JsPdf.name).toBe('JsPdf')
            expect(calls).toBe(2)
        } finally {
            vi.doUnmock('jspdf')
            vi.resetModules()
        }
    })
})

describe('rgb', () => {
    it('turns a hex colour into the three numbers jsPDF wants', () => {
        expect(rgb('#2E7D52')).toEqual([46, 125, 82])
        expect(rgb('#ffffff')).toEqual([255, 255, 255])
        expect(rgb('#000000')).toEqual([0, 0, 0])
    })
})

describe('the logo', () => {
    // The file is 400 by 249, so the height follows from the width.
    it('keeps the shape of the file', () => {
        expect(LOGO_WIDTH).toBe(26)
        expect(LOGO_HEIGHT).toBeCloseTo(26 * 249 / 400)
    })
})

describe('letterhead', () => {
    it('draws the logo at the shared size and says what the paper is', () => {
        const { pdf, written } = fakePdf()

        const y = letterhead(pdf, {
            logo: 'LOGO', label: 'STOCK TAKE', name: 'Point Campus', title: 'End of September',
            lines: ['Started: 30/09/2026', 'Generated: 01/10/2026 by A Manager'],
        })

        expect(pdf.addImage).toHaveBeenCalledWith('LOGO', 'PNG', 15, 9, LOGO_WIDTH, LOGO_HEIGHT)
        expect(written.map(w => w.words)).toEqual([
            'STOCK TAKE', 'Point Campus', 'End of September',
            'Started: 30/09/2026', 'Generated: 01/10/2026 by A Manager',
        ])
        expect(y).toBe(37)
    })

    it('puts the right hand lines against the margin it is given', () => {
        const { pdf, written } = fakePdf()

        letterhead(pdf, { logo: 'LOGO', label: 'TIME OFF RECORD', name: 'Point Campus', lines: ['Produced'], margin: 18 })

        expect(pdf.addImage).toHaveBeenCalledWith('LOGO', 'PNG', 18, 9, LOGO_WIDTH, LOGO_HEIGHT)
        expect(written.find(w => w.words === 'Produced').x).toBe(210 - 18)
        expect(pdf.line).toHaveBeenCalledWith(18, 31, 210 - 18, 31)
    })

    // The time off record has no line under the name.
    it('leaves the title out when there is none', () => {
        const { pdf, written } = fakePdf()

        letterhead(pdf, { logo: 'LOGO', label: 'TIME OFF RECORD', name: 'Point Campus' })

        expect(written.map(w => w.words)).toEqual(['TIME OFF RECORD', 'Point Campus'])
    })

    // A stock take named by its notes used to print them whole. Cut to one
    // line, it lost its last words and nothing said so.
    it('says so when a long title is cut', () => {
        const { pdf, written } = fakePdf()
        // One character a millimetre, so a line holds as many as it has room.
        pdf.splitTextToSize = vi.fn((words, room) => {
            const out = []
            for (let at = 0; at < words.length; at += Math.floor(room)) out.push(words.slice(at, at + Math.floor(room)))
            return out
        })
        const title = 'A'.repeat(200)

        letterhead(pdf, { logo: 'LOGO', label: 'STOCK TAKE', name: 'Point Campus', title, lines: ['Started', 'Closed', 'Generated'] })

        const room = 210 - (15 + LOGO_WIDTH + 6) - 15
        const shown = written[2].words
        expect(shown.endsWith('...')).toBe(true)
        expect(shown.length).toBe(Math.floor(room - 3) + 3)
    })

    // With three lines on the right it runs to the margin; a fourth would sit
    // beside it, so then it stops short of them.
    it('runs to the margin unless a fourth line comes down beside it', () => {
        const { pdf } = fakePdf()
        const textX = 15 + LOGO_WIDTH + 6

        letterhead(pdf, { logo: 'LOGO', label: 'X', name: 'Y', title: 'Short', lines: ['a', 'b', 'c'] })
        expect(pdf.splitTextToSize).toHaveBeenLastCalledWith('Short', 210 - textX - 15)

        letterhead(pdf, { logo: 'LOGO', label: 'X', name: 'Y', title: 'Short', lines: ['a', 'b', 'c', 'd'] })
        expect(pdf.splitTextToSize).toHaveBeenLastCalledWith('Short', 210 - textX - 60)
    })
})

describe('footers', () => {
    it('writes what the paper is and the page count on every page', () => {
        const { pdf, written } = fakePdf(2)

        footers(pdf, { left: 'Papi Chulo Hub stock take record' })

        expect(written).toEqual([
            { page: 1, words: 'Papi Chulo Hub stock take record', x: 15, y: 289 },
            { page: 1, words: 'Page 1 of 2', x: 195, y: 289 },
            { page: 2, words: 'Papi Chulo Hub stock take record', x: 15, y: 289 },
            { page: 2, words: 'Page 2 of 2', x: 195, y: 289 },
        ])
    })

    it('says something else on the right when the paper asks it to', () => {
        const { pdf, written } = fakePdf(1)

        footers(pdf, { left: 'Kept', right: () => 'Reference abc12345', margin: 18 })

        expect(written.map(w => w.words)).toEqual(['Kept', 'Reference abc12345'])
        expect(written[1].x).toBe(210 - 18)
    })
})
