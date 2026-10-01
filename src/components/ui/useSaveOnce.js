import { useRef, useState } from 'react'

// One save at a time, for a form's Save button.
//
// A second tap while the first save was still on its way ran the whole save
// again, and on a slow phone a tap that seems to do nothing gets tapped again.
// That made two suppliers, two menu items, an ingredient counted twice in a
// MIX, two prices both marked preferred, and two products with one name.
//
// The ref turns the second tap away straight away, before the button has had
// a chance to grey out. saving is what greys it.
//
//     const [saving, once] = useSaveOnce()
//     function handleSave(e) { e.preventDefault(); return once(save) }
export function useSaveOnce() {
    const pending = useRef(false)
    const [saving, setSaving] = useState(false)

    async function once(work) {
        if (pending.current) return
        pending.current = true
        setSaving(true)
        try {
            return await work()
        } finally {
            pending.current = false
            setSaving(false)
        }
    }

    return [saving, once]
}
