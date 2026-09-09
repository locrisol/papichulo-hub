import { useState } from 'react'
import Modal from '../Modal'
import { modalFooter, secondaryButton } from '../../lib/controlStyles'

// Putting one category's dishes in the order they should be read in.
//
// Its own screen rather than arrows on every row of the menu items table.
// Those arrows made a row that already carries eight columns and two buttons
// taller again, and they were on screen the whole time for a job done once a
// season.
//
// Nothing but names here on purpose. Arranging is about the order, and cost,
// margin and allergens are all in the way of seeing it.
//
// The order is held here and written once, on Save. Writing on every press
// meant the page behind reloading between one arrow and the next, which is both
// slow to work in and a lot of writes for a job that is really one decision.
export default function ArrangeItems({ categoryName, items, onSave, onClose }) {
    // Seeded once. The list behind this does not change while it is open, and
    // if it did, taking the change mid-arrange would move things under the hand
    // doing the arranging.
    const [order, setOrder] = useState(items)
    const [saving, setSaving] = useState(false)

    const moved = order.some((item, i) => items[i]?.id !== item.id)

    function move(index, by) {
        const to = index + by
        if (to < 0 || to >= order.length) return
        const next = [...order]
        next.splice(to, 0, ...next.splice(index, 1))
        setOrder(next)
    }

    async function save() {
        if (!moved) { onClose(); return }
        setSaving(true)
        await onSave(order)
        setSaving(false)
    }

    return (
        <Modal title={`Arrange ${categoryName}`} onClose={onClose} width="max-w-md">
            <div className="px-6 py-4">
                <p className="text-xs text-muted mb-3">
                    This is the order the category is listed in, and the order it prints in on
                    the allergen sheet.
                </p>

                {order.length === 0 ? (
                    <p className="text-sm text-muted py-6 text-center">Nothing in this category.</p>
                ) : (
                    <ol className="rounded-lg border border-border divide-y divide-border">
                        {order.map((item, i) => (
                            <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                                <span className="w-6 text-xs text-muted tabular-nums">{i + 1}</span>
                                <span className="flex-1 min-w-0 text-sm text-gray-900">{item.name}</span>
                                <button
                                    type="button"
                                    onClick={() => move(i, -1)}
                                    disabled={i === 0 || saving}
                                    aria-label={`Move ${item.name} up`}
                                    className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                                >
                                    &uarr;
                                </button>
                                <button
                                    type="button"
                                    onClick={() => move(i, 1)}
                                    disabled={i === order.length - 1 || saving}
                                    aria-label={`Move ${item.name} down`}
                                    className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                                >
                                    &darr;
                                </button>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            <div className={modalFooter}>
                {/* Says whether there is anything to save, so Save is not a
                    button you press to find out. */}
                {moved && (
                    <p className="text-xs text-muted mr-auto self-center">Not saved yet</p>
                )}
                <button type="button" onClick={onClose} className={secondaryButton} disabled={saving}>
                    {moved ? 'Cancel' : 'Close'}
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={!moved || saving}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                    {saving ? 'Saving...' : 'Save order'}
                </button>
            </div>
        </Modal>
    )
}
