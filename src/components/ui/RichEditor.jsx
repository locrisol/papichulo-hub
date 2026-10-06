import { useEffect, useRef, useState } from 'react'
import { COLOURS, richEditorHtml, richFromDom, richPlain } from '@/lib/richText'

// A comment box that shows bold, colour and size as they are typed (his, 7
// October). The buttons appear while the box is being written in.
//
// The browser's own editing does the work, and what it writes is read back
// into the few marks a comment keeps (see richFromDom), so whatever it or a
// paste puts in the box, only those are saved. A paste comes in as plain words
// for the same reason.
//
// The buttons refuse focus when pressed, so the words chosen stay chosen and
// the box does not save half way through being formatted.
//
// `value` is the stored text. `onCommit` gets it back when the box is left,
// `onChange` as it is typed, for a button that shows only once there is
// something to add.
const INK = '#1f2937'

const TOOLS = [
    { key: 'bold', label: 'Bold', run: ['bold'], face: <b>B</b> },
    ...Object.entries(COLOURS).map(([name, hex]) => ({
        key: name,
        label: `${name[0].toUpperCase()}${name.slice(1)}`,
        run: ['foreColor', hex],
        face: <span className="block w-3.5 h-3.5 rounded-full" style={{ background: hex }} />,
    })),
    {
        key: 'ink', label: 'No colour', run: ['foreColor', INK],
        face: <span className="block w-3.5 h-3.5 rounded-full border border-gray-400 bg-white" />,
    },
    { key: 'small', label: 'Smaller', run: ['fontSize', '2'], face: <span className="text-xs">A</span> },
    { key: 'normal', label: 'Normal size', run: ['fontSize', '3'], face: <span className="text-sm">A</span> },
    { key: 'big', label: 'Bigger', run: ['fontSize', '5'], face: <span className="text-lg leading-none">A</span> },
]

export default function RichEditor({ value = '', onCommit, onChange, placeholder = '', label, className = '', minRows = 1 }) {
    const ref = useRef(null)
    const shown = useRef(null)
    const [editing, setEditing] = useState(false)
    const [empty, setEmpty] = useState(!richPlain(value).trim())

    // Written in from outside only while nobody is typing in it: a reload of
    // the page's data must not move the cursor or undo a half typed word.
    useEffect(() => {
        const el = ref.current
        if (!el || document.activeElement === el || shown.current === value) return
        el.innerHTML = richEditorHtml(value)
        shown.current = value
        setEmpty(!richPlain(value).trim())
    }, [value])

    const read = () => richFromDom(ref.current)

    function changed() {
        const now = read()
        setEmpty(!richPlain(now).trim())
        onChange?.(now)
    }

    function run([command, arg]) {
        ref.current?.focus()
        document.execCommand('styleWithCSS', false, false)
        document.execCommand(command, false, arg)
        changed()
    }

    return (
        <div>
            {editing && (
                <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 mb-1.5">
                    {TOOLS.map(tool => (
                        <button
                            key={tool.key}
                            type="button"
                            aria-label={tool.label}
                            title={tool.label}
                            onMouseDown={e => e.preventDefault()}
                            onPointerDown={e => e.preventDefault()}
                            onClick={() => run(tool.run)}
                            className="min-w-[2.25rem] min-h-[2.25rem] inline-flex items-center justify-center rounded-lg
                                border border-border bg-white text-gray-800 hover:border-gray-400
                                focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            {tool.face}
                        </button>
                    ))}
                </div>
            )}
            <div>
                {/* The placeholder is drawn inside the box, so it sits where
                    the words will and the box keeps its own border. */}
                <div
                    ref={ref}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    aria-label={label || placeholder}
                    onFocus={() => setEditing(true)}
                    onInput={changed}
                    onBlur={() => {
                        setEditing(false)
                        const now = read()
                        shown.current = now
                        onCommit?.(now)
                    }}
                    onPaste={e => {
                        e.preventDefault()
                        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
                    }}
                    data-placeholder={placeholder}
                    data-empty={empty}
                    className={`whitespace-pre-wrap break-words ${className} data-[empty=true]:before:content-[attr(data-placeholder)]
                        data-[empty=true]:before:text-muted data-[empty=true]:before:pointer-events-none`}
                    style={{ minHeight: `${minRows * 1.5 + 1.25}em` }}
                />
            </div>
        </div>
    )
}
