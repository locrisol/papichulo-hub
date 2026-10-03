import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The browser client, with only what uploadCharts and sendReport reach for.
const db = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn(), paths: [] }))
vi.mock('@/lib/supabase', () => ({
    supabase: {
        functions: { invoke: db.invoke },
        storage: {
            from: () => ({
                upload: db.upload,
                getPublicUrl: path => ({ data: { publicUrl: `https://store.test/${path}` } }),
            }),
        },
    },
}))

// Drawing needs a canvas, which a test has not got. Any picture will do.
vi.mock('@/lib/reportChartImage', () => ({
    MAIL_WIDTH: 760,
    chartToBlob: vi.fn(async () => new Blob(['png'])),
}))

const { sendWords, uploadCharts, sendReport } = await import('./reportMail')

describe('sendWords, after a publish', () => {
    it('says how many people got it', () => {
        expect(sendWords({ sent: 3 })).toBe('Published and sent to 3 people.')
    })

    it('counts one person as a person', () => {
        expect(sendWords({ sent: 1 })).toBe('Published and sent to 1 person.')
    })

    // A week written up and frozen with nobody to send it to is still a week
    // written up, so this is not a failure and does not read as one.
    it('says so when there is nobody on the list', () => {
        expect(sendWords({ sent: 0 })).toBe('Published. Nobody is on the list, so no mail went out.')
    })
})

describe('sendWords, after a test', () => {
    it('says it was a test and how far it went', () => {
        expect(sendWords({ sent: 2 }, { test: true })).toBe('Test sent to 2 addresses.')
    })

    it('counts one address as an address, not a person', () => {
        expect(sendWords({ sent: 1 }, { test: true })).toBe('Test sent to 1 address.')
    })

    it('says so when the list is empty', () => {
        expect(sendWords({ sent: 0 }, { test: true }))
            .toBe('The test went nowhere: there is nobody on the list.')
    })
})

// The reason this function exists. An address the function dropped is an
// address the card on the report still names, so saying nothing turns that card
// into a lie that nobody notices for a fortnight.
describe('sendWords, when an address was skipped', () => {
    it('names the one that was dropped', () => {
        expect(sendWords({ sent: 2, skipped: ['test.owner@papichulo.test'] }))
            .toBe('Published and sent to 2 people. One address was skipped, because it cannot '
                + 'receive mail: test.owner@papichulo.test.')
    })

    it('names all of them when there are several', () => {
        expect(sendWords({ sent: 1, skipped: ['a@b.test', 'c@d.invalid'] }))
            .toBe('Published and sent to 1 person. 2 addresses were skipped, because they cannot '
                + 'receive mail: a@b.test, c@d.invalid.')
    })

    it('says it after a test too, where finding out is the whole point', () => {
        expect(sendWords({ sent: 1, skipped: ['a@b.test'] }, { test: true }))
            .toContain('One address was skipped')
    })

    // Nothing skipped is the normal case and it should read as normal, not as
    // a sentence about an empty list.
    it('says nothing extra when nothing was skipped', () => {
        expect(sendWords({ sent: 2, skipped: [] })).toBe('Published and sent to 2 people.')
        expect(sendWords({ sent: 2 })).toBe('Published and sent to 2 people.')
    })
})

describe('sendWords, given nothing much', () => {
    it('does not throw on an empty or missing result', () => {
        expect(sendWords({})).toBe('Published. Nobody is on the list, so no mail went out.')
        expect(sendWords(null)).toBe('Published. Nobody is on the list, so no mail went out.')
        expect(sendWords(undefined)).toBe('Published. Nobody is on the list, so no mail went out.')
    })
})

// A correction or a second test used to upload to the same address as the
// first, and a mail that had already shown that address could show the old
// chart again. Each call names its files afresh now.
describe('uploadCharts', () => {
    beforeEach(() => {
        db.upload.mockReset()
        db.upload.mockImplementation(async path => {
            db.paths.push(path)
            return { error: null }
        })
        db.paths.length = 0
    })
    afterEach(() => vi.restoreAllMocks())

    it('gives each call new files, never writing over an old one', async () => {
        vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000)

        const first = await uploadCharts({ reportId: 'r1', rows: [] })
        const firstPaths = [...db.paths]
        db.paths.length = 0
        const second = await uploadCharts({ reportId: 'r1', rows: [] })

        expect(firstPaths.length).toBeGreaterThan(0)
        expect(db.paths.length).toBe(firstPaths.length)
        for (const path of db.paths) expect(firstPaths).not.toContain(path)
        expect(Object.values(first).length).toBeGreaterThan(0)
        for (const url of Object.values(second)) expect(Object.values(first)).not.toContain(url)

        expect(firstPaths[0]).toMatch(/^r1\/1000-\w+\.png$/)
        for (const call of db.upload.mock.calls) expect(call[2]).toMatchObject({ upsert: false })
    })

    it('keeps a test in files of its own, under the report', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(3000)
        await uploadCharts({ reportId: 'r1', rows: [], test: true })
        expect(db.paths.length).toBeGreaterThan(0)
        for (const path of db.paths) expect(path).toMatch(/^r1\/test-3000-\w+\.png$/)
    })
})

describe('sendReport', () => {
    beforeEach(() => db.invoke.mockReset())

    it('says what the function said, not that it failed', async () => {
        db.invoke.mockResolvedValue({
            data: null,
            error: {
                message: 'Edge Function returned a non-2xx status code',
                context: { json: async () => ({ error: 'This report has not been published, so it cannot be sent.' }) },
            },
        })
        await expect(sendReport({ reportId: 'r1' }))
            .rejects.toThrow('This report has not been published, so it cannot be sent.')
    })

    it('reads a failure with no body the way every other screen does', async () => {
        db.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
        await expect(sendReport({ reportId: 'r1' }))
            .rejects.toThrow('Could not reach the server. Check your connection and try again.')
    })

    it('hands back what the function answered', async () => {
        db.invoke.mockResolvedValue({ data: { sent: 2 }, error: null })
        expect(await sendReport({ reportId: 'r1' })).toEqual({ sent: 2 })
    })
})
