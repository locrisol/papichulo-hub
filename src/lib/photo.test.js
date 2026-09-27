// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fitWithin, shrinkPhoto, photoPath, LONGEST_SIDE } from '@/lib/photo'

// jsdom decodes no pictures and has no canvas, so both are stand ins that
// record what they were asked. What is checked is the arithmetic and the order
// of things, not what the JPEG looks like.

afterEach(() => vi.unstubAllGlobals())

function fakeCanvas(blob = new Blob(['x'], { type: 'image/jpeg' })) {
    const drawn = []
    const context = new Proxy({}, {
        get: (_, key) => (key === 'drawImage' ? (...args) => drawn.push(args) : () => {}),
        set: () => true,
    })
    const canvas = {
        width: 0, height: 0,
        getContext: () => context,
        toBlob: (done, type, quality) => { canvas.asked = { type, quality }; done(blob) },
    }
    return { canvas, drawn }
}

describe('the size a photo is shrunk to', () => {
    it('brings a phone photo down to 1600 on its longest side, keeping its shape', () => {
        expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 })
        expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 })
    })

    it('leaves a small picture as it is rather than blowing it up', () => {
        expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    })
})

describe('shrinking', () => {
    it('draws it at the smaller size and saves a JPEG', async () => {
        const close = vi.fn()
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 2000, close })))
        const { canvas, drawn } = fakeCanvas()
        const blob = await shrinkPhoto(new Blob(['raw']), { makeCanvas: () => canvas })
        expect(canvas.width).toBe(LONGEST_SIDE)
        expect(canvas.height).toBe(800)
        expect(drawn[0].slice(1)).toEqual([0, 0, 1600, 800])
        expect(canvas.asked).toEqual({ type: 'image/jpeg', quality: 0.72 })
        expect(blob.type).toBe('image/jpeg')
        expect(close).toHaveBeenCalled()
    })

    it('turns a portrait photo the right way up', async () => {
        const decode = vi.fn(async () => ({ width: 10, height: 20 }))
        vi.stubGlobal('createImageBitmap', decode)
        await shrinkPhoto(new Blob(['raw']), { makeCanvas: () => fakeCanvas().canvas })
        expect(decode.mock.calls[0][1]).toEqual({ imageOrientation: 'from-image' })
    })

    it('says so plainly when the phone cannot make the JPEG', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10 })))
        const { canvas } = fakeCanvas(null)
        await expect(shrinkPhoto(new Blob(['raw']), { makeCanvas: () => canvas }))
            .rejects.toThrow('The photo could not be read. Try taking it again.')
    })
})

describe('where a photo goes', () => {
    it('puts a round\'s photo under the restaurant and the round, and a guide under guides', () => {
        expect(photoPath('R1', 'round', 'round-9')).toMatch(/^R1\/rounds\/round-9\/[0-9a-f-]{36}\.jpg$/)
        expect(photoPath('R1', 'guide')).toMatch(/^R1\/guides\/[0-9a-f-]{36}\.jpg$/)
    })
})
