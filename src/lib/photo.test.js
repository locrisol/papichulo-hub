// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fitWithin, jpegSize, shrinkPhoto, photoPath, LONGEST_SIDE } from '@/lib/photo'

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
    it('brings a phone photo down to 1200 on its longest side, keeping its shape', () => {
        expect(fitWithin(4032, 3024)).toEqual({ width: 1200, height: 900 })
        expect(fitWithin(3024, 4032)).toEqual({ width: 900, height: 1200 })
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
        expect(canvas.height).toBe(600)
        expect(drawn[0].slice(1)).toEqual([0, 0, 1200, 600])
        expect(canvas.asked).toEqual({ type: 'image/jpeg', quality: 0.7 })
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

// The start of a JPEG: the camera's note on which way to turn it, then the
// frame with its size. Enough to be measured, nothing to look at.
function jpegHead({ width, height, orientation }) {
    const bytes = [0xFF, 0xD8]
    if (orientation) {
        const tiff = [0x4D, 0x4D, 0, 0x2A, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]
        const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
        const length = exif.length + 2
        bytes.push(0xFF, 0xE1, length >> 8, length & 255, ...exif)
    }
    bytes.push(0xFF, 0xC0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, ...Array(9).fill(0), 0xFF, 0xDA)
    return new Uint8Array(bytes).buffer
}

// A file that hands over its first bytes, as a phone's photo does.
const photoFile = head => ({ slice: () => ({ arrayBuffer: async () => head }) })

describe('a photo measured before it is opened', () => {
    it('reads the size from the first bytes', () => {
        expect(jpegSize(jpegHead({ width: 8160, height: 6120 }))).toEqual({ width: 8160, height: 6120 })
    })

    it('swaps it for a photo the camera says to turn', () => {
        expect(jpegSize(jpegHead({ width: 8160, height: 6120, orientation: 6 }))).toEqual({ width: 6120, height: 8160 })
        expect(jpegSize(jpegHead({ width: 8160, height: 6120, orientation: 3 }))).toEqual({ width: 8160, height: 6120 })
    })

    it('gives up on anything that is not a JPEG', () => {
        expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4E, 0x47]).buffer)).toBeNull()
        expect(jpegSize(new Uint8Array([0xFF, 0xD8, 0xFF, 0xDA]).buffer)).toBeNull()
    })
})

// A 50MP photo opened full size is about 200MB, more than an older phone has.
describe('a big photo', () => {
    it('is opened straight at the size it is going to be', async () => {
        const close = vi.fn()
        const open = vi.fn(async () => ({ width: 900, height: 1200, close }))
        vi.stubGlobal('createImageBitmap', open)
        const { canvas } = fakeCanvas()
        await shrinkPhoto(photoFile(jpegHead({ width: 8160, height: 6120, orientation: 6 })), { makeCanvas: () => canvas })
        expect(open).toHaveBeenCalledTimes(1)
        expect(open.mock.calls[0][1]).toEqual({ imageOrientation: 'from-image', resizeWidth: 900, resizeHeight: 1200, resizeQuality: 'high' })
        expect([canvas.width, canvas.height]).toEqual([900, 1200])
    })

    it('is opened the long way when the browser sized it before turning it', async () => {
        const wrong = { width: 1200, height: 900, close: vi.fn() }
        const open = vi.fn()
            .mockResolvedValueOnce(wrong)
            .mockResolvedValueOnce({ width: 6120, height: 8160, close: vi.fn() })
        vi.stubGlobal('createImageBitmap', open)
        const { canvas } = fakeCanvas()
        await shrinkPhoto(photoFile(jpegHead({ width: 8160, height: 6120, orientation: 6 })), { makeCanvas: () => canvas })
        expect(wrong.close).toHaveBeenCalled()
        expect(open.mock.calls[1][1]).toEqual({ imageOrientation: 'from-image' })
        expect([canvas.width, canvas.height]).toEqual([900, 1200])
    })

    it('is opened the long way when it is already small', async () => {
        const open = vi.fn(async () => ({ width: 1000, height: 750 }))
        vi.stubGlobal('createImageBitmap', open)
        await shrinkPhoto(photoFile(jpegHead({ width: 1000, height: 750 })), { makeCanvas: () => fakeCanvas().canvas })
        expect(open).toHaveBeenCalledTimes(1)
        expect(open.mock.calls[0][1]).toEqual({ imageOrientation: 'from-image' })
    })
})

describe('where a photo goes', () => {
    it('puts a round\'s photo under the restaurant and the round, and a guide under guides', () => {
        expect(photoPath('R1', 'round', 'round-9')).toMatch(/^R1\/rounds\/round-9\/[0-9a-f-]{36}\.jpg$/)
        expect(photoPath('R1', 'guide')).toMatch(/^R1\/guides\/[0-9a-f-]{36}\.jpg$/)
    })
})
