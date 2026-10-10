import { COLOURS, SIZES, parseRich } from '@/lib/richText'

// A comment as it was written: bold, coloured and sized where it was, and a
// plain comment from before formatting as plain text. Built from the stored
// marks one by one, never set as HTML, so nothing in a comment can run.
export default function RichText({ text, rich, className = '' }) {
    if (!rich) return <p className={`whitespace-pre-line break-words ${className}`}>{text}</p>
    return <p className={`break-words ${className}`}>{draw(parseRich(text))}</p>
}

function draw(nodes) {
    return nodes.map((n, i) => {
        if (n.t === 'text') return n.v
        if (n.t === 'br') return <br key={i} />
        if (n.t === 'b') return <strong key={i}>{draw(n.kids)}</strong>
        const style = n.t === 'c' ? { color: COLOURS[n.v] } : { fontSize: SIZES[n.v] }
        return <span key={i} style={style}>{draw(n.kids)}</span>
    })
}
