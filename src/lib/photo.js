// Shrinking a photo on the phone before it goes anywhere.
//
// A phone camera takes pictures of 3 to 12MB, some of 50MP and more, and a
// round of a weekly deep clean can ask for twenty of them. His words: "the
// quality should be reduced to something we can still see what was done but
// without a picture being excessively big", and on 10 October, "the minimum
// necessary size just to make it visible without a high definition". 1200
// across the longest side fills a phone screen and the PDF's picture box, and
// at JPEG quality 0.7 that lands at about 80 to 200KB. The bucket refuses
// anything over 3MB, so a photo that somehow did not shrink says so instead of
// filling it.
//
// Done in the browser because that is the only place the full size photo
// exists. Sent up full size and shrunk afterwards, it would already have cost
// the upload on kitchen wifi and the storage until the shrinking ran.

// The private bucket every checklist photo and guide picture lives in.
export const PHOTO_BUCKET = 'checklist-photos'

export const LONGEST_SIDE = 1200
export const QUALITY = 0.7

// The size that fits inside the longest side, keeping the shape. A photo
// already smaller is left as it is rather than blown up.
export function fitWithin(width, height, longest = LONGEST_SIDE) {
    const scale = Math.min(1, longest / Math.max(width, height))
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// Enough of the start of a file to reach a JPEG's size, past the camera's
// notes and the small preview it keeps in them.
const HEAD = 256 * 1024

// A JPEG's size the way it shows, read from its first bytes without opening
// the picture: the frame gives the width and height, and the camera's note on
// which way to turn it swaps them for a portrait photo. null for anything that
// is not a JPEG, or one this cannot read, which is then opened the long way.
export function jpegSize(buffer) {
    const v = new DataView(buffer)
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null
    let orientation = 1
    let at = 2
    while (at + 4 <= v.byteLength) {
        if (v.getUint8(at) !== 0xFF) return null
        const marker = v.getUint8(at + 1)
        // A spare 0xFF before a marker is allowed and means nothing.
        if (marker === 0xFF) { at += 1; continue }
        if (marker === 0xDA || marker === 0xD9) return null
        const length = v.getUint16(at + 2)
        if (marker === 0xE1) orientation = exifOrientation(v, at + 4, length - 2) || orientation
        // Every start of frame, which is C0 to CF less the three that are not.
        if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
            if (at + 9 > v.byteLength) return null
            const height = v.getUint16(at + 5)
            const width = v.getUint16(at + 7)
            if (!width || !height) return null
            return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height }
        }
        at += 2 + length
    }
    return null
}

// The camera's note on which way to turn the picture, 1 to 8, from the Exif
// block's first list.
function exifOrientation(v, start, size) {
    const end = Math.min(start + size, v.byteLength)
    if (start + 14 > end || v.getUint32(start) !== 0x45786966 || v.getUint16(start + 4) !== 0) return null
    const tiff = start + 6
    const little = v.getUint16(tiff) === 0x4949
    if (!little && v.getUint16(tiff) !== 0x4D4D) return null
    const list = tiff + v.getUint32(tiff + 4, little)
    if (list + 2 > end) return null
    const count = v.getUint16(list, little)
    for (let i = 0; i < count; i++) {
        const entry = list + 2 + i * 12
        if (entry + 12 > end) return null
        if (v.getUint16(entry, little) === 0x0112) return v.getUint16(entry + 8, little)
    }
    return null
}

// A big photo opened straight at the size it is going to be, so the phone
// never holds the whole of it: a 50MP picture opened full size is about 200MB,
// which an older phone may not have to give.
//
// Only where the size can be read first, and only kept if it came out the
// shape asked for. A browser that sizes it before turning it the right way up
// gives it back the other way round, and that one is opened the long way.
async function openSmall(file, longest) {
    try {
        const size = jpegSize(await file.slice(0, HEAD).arrayBuffer())
        if (!size) return null
        const fit = fitWithin(size.width, size.height, longest)
        if (fit.width === size.width && fit.height === size.height) return null
        const picture = await createImageBitmap(file, {
            imageOrientation: 'from-image', resizeWidth: fit.width, resizeHeight: fit.height, resizeQuality: 'high',
        })
        if (picture.width === fit.width && picture.height === fit.height) return picture
        picture.close?.()
        return null
    } catch {
        // Opened the long way below.
        return null
    }
}

// The picture itself, turned the right way up. A phone saves a portrait photo
// as a landscape one with a note saying which way to turn it; createImageBitmap
// reads the note, and an <img> does in every browser that has not got it.
async function decode(file, longest) {
    if (typeof createImageBitmap === 'function') {
        const small = await openSmall(file, longest)
        if (small) return small
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' })
        } catch {
            // Some browsers cannot decode a HEIC through here. The <img> below
            // gets a second go.
        }
    }
    const url = URL.createObjectURL(file)
    try {
        const img = new Image()
        img.src = url
        await img.decode()
        return img
    } finally {
        URL.revokeObjectURL(url)
    }
}

// A JPEG no bigger than it needs to be. makeCanvas is only there so the tests
// can hand in a stand in, since jsdom has no canvas.
export async function shrinkPhoto(file, { longest = LONGEST_SIDE, quality = QUALITY, makeCanvas } = {}) {
    const picture = await decode(file, longest)
    const { width, height } = fitWithin(picture.width, picture.height, longest)
    const canvas = makeCanvas ? makeCanvas() : document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    // White behind it, so a transparent screenshot does not come out black.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(picture, 0, 0, width, height)
    picture.close?.()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) throw new Error('The photo could not be read. Try taking it again.')
    return blob
}

// Where a photo goes in the checklist-photos bucket. The first folder is the
// restaurant, which is what the bucket's rules check, and the second says
// whether it is a guide picture a manager put on a task or a photo taken
// during a round.
export function photoPath(restaurantId, kind, folder) {
    const name = `${crypto.randomUUID()}.jpg`
    return kind === 'guide' ? `${restaurantId}/guides/${name}` : `${restaurantId}/rounds/${folder}/${name}`
}
