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
export default function ArrangeItems({ categoryName, items, onMove, busy, onClose }) {
    return (
        <Modal title={`Arrange ${categoryName}`} onClose={onClose} width="max-w-md">
            <div className="px-6 py-4">
                <p className="text-xs text-muted mb-3">
                    This is the order the category is listed in, and the order it prints in on
                    the allergen sheet.
                </p>

                {items.length === 0 ? (
                    <p className="text-sm text-muted py-6 text-center">Nothing in this category.</p>
                ) : (
                    <ol className="rounded-lg border border-border divide-y divide-border">
                        {items.map((item, i) => (
                            <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                                <span className="w-6 text-xs text-muted tabular-nums">{i + 1}</span>
                                <span className="flex-1 min-w-0 text-sm text-gray-900">{item.name}</span>
                                <button
                                    type="button"
                                    onClick={() => onMove(item, -1)}
                                    disabled={i === 0 || busy}
                                    aria-label={`Move ${item.name} up`}
                                    className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                                >
                                    &uarr;
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onMove(item, 1)}
                                    disabled={i === items.length - 1 || busy}
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

            {/* Every press has already been saved, so there is nothing to
                confirm and nothing to lose by closing it. */}
            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Done</button>
            </div>
        </Modal>
    )
}
