// Comments with a little formatting: bold, one of three colours, and smaller
// or bigger (his, 7 October).
//
// **Stored as text with a handful of marks and nothing else**:
//
//   <b>…</b>                      bold
//   <span data-c="red">…</span>   red, green or orange
//   <span data-s="big">…</span>   small or big
//   <br>                          a new line
//
// with & < and > written as &amp; &lt; &gt;. Whatever a browser's editing box
// or a paste produces is read back into these on saving and the rest dropped,
// so what is stored can never carry a link, a picture or a script. The mail
// cannot import this file and keeps its own reader, kept equal by a test.
//
// A comment written before this has no marks and is plain text. The item says
// which with meta.rich, because plain text can hold a < of its own.

export const COLOURS = { red: '#B91C1C', green: '#1F7A4C', orange: '#C2410C' }
export const SIZES = { small: '0.85em', big: '1.25em' }

const TOKEN = /<b>|<\/b>|<span data-([cs])="([a-z]+)">|<\/span>|<br>|[^<]+|</g

// The space an editing box puts where two spaces were typed.
const NBSP = new RegExp(String.fromCharCode(160), 'g')

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const encode = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The stored text as a tree: { t: 'text', v }, { t: 'br' }, or a mark,
// { t: 'b' | 'c' | 's', v, kids }. A mark this does not know is read as text.
export function parseRich(stored) {
    const root = { kids: [] }
    const stack = [root]
    const top = () => stack[stack.length - 1]
    for (const [tok, kind, value] of String(stored || '').matchAll(TOKEN)) {
        if (tok === '<b>') {
            const node = { t: 'b', kids: [] }
            top().kids.push(node)
            stack.push(node)
        } else if (kind && ((kind === 'c' && COLOURS[value]) || (kind === 's' && SIZES[value]))) {
            const node = { t: kind, v: value, kids: [] }
            top().kids.push(node)
            stack.push(node)
        } else if ((tok === '</b>' && top().t === 'b') || (tok === '</span>' && ['c', 's'].includes(top().t))) {
            stack.pop()
        } else if (tok === '<br>') {
            top().kids.push({ t: 'br' })
        } else {
            top().kids.push({ t: 'text', v: decode(tok) })
        }
    }
    return root.kids
}

export function serializeRich(nodes) {
    return (nodes || []).map(n => {
        if (n.t === 'text') return encode(n.v)
        if (n.t === 'br') return '<br>'
        const inner = serializeRich(n.kids)
        if (!inner) return ''
        if (n.t === 'b') return `<b>${inner}</b>`
        return `<span data-${n.t}="${n.v}">${inner}</span>`
    }).join('')
}

// The words alone, a line each, for the plain copy of the mail and for asking
// whether anything was written at all.
export function richPlain(stored) {
    const walk = nodes => nodes.map(n => (n.t === 'text' ? n.v : n.t === 'br' ? '\n' : walk(n.kids))).join('')
    return walk(parseRich(stored))
}

// For the editing box: the stored marks with the look they stand for, so the
// box shows bold and colour as they will be.
export function richEditorHtml(stored) {
    const walk = nodes => nodes.map(n => {
        if (n.t === 'text') return encode(n.v)
        if (n.t === 'br') return '<br>'
        const inner = walk(n.kids)
        if (n.t === 'b') return `<b>${inner}</b>`
        const style = n.t === 'c' ? `color:${COLOURS[n.v]}` : `font-size:${SIZES[n.v]}`
        return `<span data-${n.t}="${n.v}" style="${style}">${inner}</span>`
    }).join('')
    return walk(parseRich(stored))
}

// What a browser's editing box holds, read back into the stored marks.
//
// Browsers write the same thing differently: bold as <b>, <strong> or a
// font-weight; colour as <font color> or a style; size as <font size>; a new
// line as <br>, <div> or <p>. Each is read for what it means and anything
// else is dropped, keeping its words.
export function richFromDom(element) {
    const hex = value => {
        const v = String(value || '').trim().toLowerCase()
        const rgb = v.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
        if (rgb) return '#' + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('')
        return v
    }
    const colourOf = el => {
        const c = el.getAttribute?.('data-c')
        if (COLOURS[c]) return c
        const raw = hex(el.getAttribute?.('color') || el.style?.color)
        return Object.keys(COLOURS).find(k => COLOURS[k].toLowerCase() === raw) || null
    }
    const sizeOf = el => {
        const s = el.getAttribute?.('data-s')
        if (SIZES[s]) return s
        const font = el.tagName === 'FONT' ? el.getAttribute('size') : null
        if (font) return Number(font) >= 5 ? 'big' : Number(font) <= 2 ? 'small' : null
        const px = String(el.style?.fontSize || '')
        if (px === SIZES.big || px === 'x-large' || px === 'large') return 'big'
        if (px === SIZES.small || px === 'small' || px === 'x-small') return 'small'
        return null
    }
    const boldOf = el => ['B', 'STRONG'].includes(el.tagName)
        || ['bold', '700', '800', '900'].includes(String(el.style?.fontWeight || ''))

    const walk = (node, out) => {
        for (const child of node.childNodes) {
            if (child.nodeType === 3) {
                if (child.nodeValue) out.push({ t: 'text', v: child.nodeValue.replace(NBSP, ' ') })
                continue
            }
            if (child.nodeType !== 1) continue
            if (child.tagName === 'BR') { out.push({ t: 'br' }); continue }
            const block = ['DIV', 'P'].includes(child.tagName)
            if (block && out.length && out[out.length - 1].t !== 'br') out.push({ t: 'br' })
            let into = out
            const wrap = node2 => { into.push(node2); into = node2.kids }
            if (boldOf(child)) wrap({ t: 'b', kids: [] })
            const c = colourOf(child)
            if (c) wrap({ t: 'c', v: c, kids: [] })
            const s = sizeOf(child)
            if (s) wrap({ t: 's', v: s, kids: [] })
            walk(child, into)
        }
        return out
    }
    const nodes = walk(element, [])
    // A trailing new line is the box's own, not one somebody typed.
    while (nodes.length && nodes[nodes.length - 1].t === 'br') nodes.pop()
    return serializeRich(nodes)
}

// A comment from before formatting, as the marks, so it can be edited in the
// same box and saved formatted from then on.
export function plainToRich(text) {
    return serializeRich(String(text || '').split(/\r?\n/).flatMap((line, i) => (
        i === 0 ? [{ t: 'text', v: line }] : [{ t: 'br' }, { t: 'text', v: line }]
    )).filter(n => n.t === 'br' || n.v))
}

// What an item holds, as the marks, whether it was written before or after.
export const richOf = item => (item?.meta?.rich ? item.note || '' : plainToRich(item?.note))
