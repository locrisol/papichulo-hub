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

// ------------------------------------------------------------- the header

// Printable ASCII, the only thing a header line can carry as it is.
const PLAIN = /^[ -~]*$/

// A name or a subject on its way into a header, as one line.
//
// A header ends at a line break, so a line break typed into somebody's name, or
// a restaurant's, would start a header of its own under our name: a Reply-To
// pointing anywhere, or an end to the mail and the start of another. Every
// control character becomes a space, and the spaces are tidied.
export function oneLine(value) {
    return Array.from(String(value ?? ''), ch => {
        const code = ch.charCodeAt(0)
        return code < 32 || code === 127 ? ' ' : ch
    }).join('').replace(/ {2,}/g, ' ').trim()
}

// Text for a header, encoded when it has to be (RFC 2047).
//
// Plain text goes as it is. Anything with an accent in it, María for one, goes
// as UTF-8 in base64 words, each one short and each one whole characters, with
// a fold between them so no line of the header runs past 76. denomailer's own
// version left the spaces raw inside the word, which the standard does not
// allow, and cut a long one with no space at the start of the next line, which
// ends the header there.
export function encodedWords(value) {
    const text = oneLine(value)
    // Plain text that happens to look like the start of an encoded word is
    // encoded too, or a mail app would try to read it as one.
    if (PLAIN.test(text) && !text.includes('=?')) return text

    const bytes = new TextEncoder()
    const pieces = []
    let piece = ''
    for (const ch of text) {
        // 36 bytes is 48 characters of base64, 60 with the markers round it,
        // which leaves room for "Subject: " in front of the first.
        if (piece && bytes.encode(piece + ch).length > 36) {
            pieces.push(piece)
            piece = ''
        }
        piece += ch
    }
    if (piece) pieces.push(piece)

    return pieces.map(p => `=?UTF-8?B?${base64(bytes.encode(p))}?=`).join('\r\n ')
}

// The name in front of the address in "Name <address>", ready for the From
// line.
//
// Split the same way denomailer splits it. A plain name stays as it is, quotes
// and all. An encoded one ends in a fold, because denomailer puts the address
// straight after it and the line would otherwise run past 76.
export function displayName(from) {
    const found = /^([^<]*)<([^>]+)>\s*$/.exec(String(from ?? ''))
    if (!found) return ''

    const name = oneLine(found[1])
    if (!name) return ''
    if (PLAIN.test(name) && !name.includes('=?')) return name

    // An encoded word cannot sit inside quotes, and does not need to: base64
    // carries the commas that were the reason for them.
    const bare = /^".*"$/.test(name) ? name.slice(1, -1) : name
    return `${encodedWords(bare)}\r\n`
}

// The same test denomailer makes of a bare address, so an address it would
// refuse is dropped here first. It has a bug when that happens to an address
// that is not in To: it copies the rest into To, which would put a second To
// line in the mail.
const ADDRESS = /^[^<>()[\]\\,;:\s@"]+@[a-zA-Z0-9-]+\.([a-zA-Z0-9-]+\.)*[a-zA-Z]{2,}$/

// The header, put right after denomailer has had its go and before anything is
// written. It is handed in as a preprocessor, which is the library's own way of
// changing a mail on its way out.
//
// What it gets wrong:
//
// - The subject and the sender's name, which it encodes badly the moment they
//   have an accent. Both are put back from the mail, encoded properly.
// - To, which it joins with semicolons. A mail app reading the To line to reply
//   to everybody expects commas. So the recipients go on the envelope only,
//   which is who the mail is actually delivered to, and the To line is written
//   here, with commas. denomailer writes no header at all for that list.
export function headersFor(mail) {
    return (resolved) => {
        const everybody = resolved.to.filter(person => {
            if (ADDRESS.test(person.mail)) return true
            console.warn('skipping an address the mail library will not take:', person.mail)
            return false
        })

        resolved.subject = encodedWords(mail.subject)
        resolved.from = { ...resolved.from, name: displayName(mail.from) }
        resolved.bcc = [...resolved.bcc, ...everybody]
        resolved.to = []
        resolved.headers = { ...resolved.headers, To: everybody.map(person => person.mail).join(', ') }
        return resolved
    }
}

// A PDF sent from the browser, as base64 and nothing else.
//
// denomailer writes an attachment into the mail as it is, a line at a time, so
// anything in it that is not base64 is written straight into the conversation
// with the mail server: a line with a single full stop on it ends the mail, and
// whatever follows is read as the next command. So it has to be base64 all the
// way through, and it has to be a PDF, which in base64 starts JVBERi (%PDF).
export function base64Pdf(value) {
    const text = String(value ?? '')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null
    if (!text.startsWith('JVBERi')) return null
    return text
}
