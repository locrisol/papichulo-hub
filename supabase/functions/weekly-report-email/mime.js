// The pieces of a mail, finished before denomailer sees them.
//
// Both mail functions send through denomailer 1.6.0, and left to itself it
// writes the text and the HTML as quoted printable, cut every 74 characters. It
// never doubles a full stop at the start of a line, which the mail protocol
// expects the sender to do: a mail server takes the first full stop off any line
// that starts with one (RFC 5321, 4.5.2). So wherever a cut landed just before a
// full stop, the full stop was gone by the time the mail arrived. Run over a
// real report it came to about four a send: €165.00 arriving as €16500,
// line-height:1.45 as 145, delivery.png as deliverypng.
//
// Base64 has no full stop in it at all, so a part sent as base64 cannot lose
// one, and denomailer writes a part it is handed as it is. It also ends the =20
// that email.js works round, since there is no quoted printable left to get it
// wrong.
//
// The same file sits in both functions' folders, because a function only
// deploys its own folder. src/lib/mailMime.test.js fails if the two differ.

// Bytes to base64, in chunks.
//
// String.fromCharCode(...bytes) on a whole PDF blows the argument limit and
// throws RangeError, which arrives as "failed to send a request to the edge
// function" and says nothing at all. Eight thousand at a time is well inside it.
export function base64(bytes) {
    let binary = ''
    const step = 8192
    for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode(...bytes.subarray(i, i + step))
    }
    return btoa(binary)
}

// Text as base64, in lines of 76 the way a mail carries it.
//
// The UTF-8 bytes, not the string: btoa only takes one byte per character and
// throws on the euro sign, which would stop every report going out.
export function base64Lines(text) {
    const flat = base64(new TextEncoder().encode(String(text ?? '')))
    return (flat.match(/.{1,76}/g) || []).join('\r\n')
}

// The plain text and the HTML, ready for denomailer's mimeContent.
//
// Plain text first and HTML last, because a mail app shows the last of the
// alternatives it can read. The plain part is left out when there is none.
export function mimeParts({ text, html }) {
    const parts = []
    if (text) {
        parts.push({
            mimeType: 'text/plain; charset="utf-8"',
            transferEncoding: 'base64',
            content: base64Lines(text),
        })
    }
    parts.push({
        mimeType: 'text/html; charset="utf-8"',
        transferEncoding: 'base64',
        content: base64Lines(html),
    })
    return parts
}
