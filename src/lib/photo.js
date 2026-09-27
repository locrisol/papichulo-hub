// Shrinking a photo on the phone before it goes anywhere.
//
// A phone camera takes pictures of 3 to 12MB, and a round of a weekly deep
// clean can ask for twenty of them. His words: "the quality should be reduced
// to something we can still see what was done but without a picture being
// excessively big." 1600 across the longest side is more than a phone screen
// shows and enough to read a label on a bottle in the picture, and at JPEG
// quality 0.72 that lands at 150 to 400KB. The bucket refuses anything over
// 3MB, so a photo that somehow did not shrink says so instead of filling it.
//
// Done in the browser because that is the only place the full size photo
// exists. Sent up full size and shrunk afterwards, it would already have cost
// the upload on kitchen wifi and the storage until the shrinking ran.

// The private bucket every checklist photo and guide picture lives in.
export const PHOTO_BUCKET = 'checklist-photos'

export const LONGEST_SIDE = 1600
export const QUALITY = 0.72

// The size that fits inside the longest side, keeping the shape. A photo
// already smaller is left as it is rather than blown up.
export function fitWithin(width, height, longest = LONGEST_SIDE) {
    const scale = Math.min(1, longest / Math.max(width, height))
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// The picture itself, turned the right way up. A phone saves a portrait photo
// as a landscape one with a note saying which way to turn it; createImageBitmap
// reads the note, and an <img> does in every browser that has not got it.
async function decode(file) {
    if (typeof createImageBitmap === 'function') {
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
    const picture = await decode(file)
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
