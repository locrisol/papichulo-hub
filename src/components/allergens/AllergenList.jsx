import { ALLERGEN_KEYS, ALLERGEN_LABELS, allergenLook } from '../../lib/allergens'
import { card } from '../../lib/controlStyles'

// The allergen list itself, category by category.
//
// Pulled out of PublicAllergensPage so it can be rendered and looked at on its
// own, and so the page is about fetching and this is about showing. It holds no
// state: which row is open is the page's business, because the page is what a
// customer's back button acts on.
//
// Every row here is a row from lib/allergenSheet. It does not know or care
// whether it came from a dish, from two sizes of one dish, or from a sauce
// handed over beside it.
export default function AllergenList({ groups, expandedId, onToggle }) {
    return (
        <div className="space-y-6">
            {groups.map(({ category, rows }) => (
              <div key={category.id}>
                <h2 className="font-serif text-lg font-bold text-gray-900 mb-2 px-1">{category.name}</h2>
                <div className={`${card} overflow-hidden`}>
                  {rows.map((row, i) => {
                    const itemAllergens = row.allergens
                    const present = ALLERGEN_KEYS
                      .map(key => ({ key, state: itemAllergens[key] }))
                      .filter(a => a.state !== 'none')
                    const isExpanded = expandedId === row.key
                    const complete = row.complete

                    return (
                      <div
                        key={row.key}
                        className={i < rows.length - 1 ? 'border-b border-border' : ''}
                      >
                        <button
                          type="button"
                          onClick={() => onToggle(isExpanded ? null : row.key)}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900">{row.name}</p>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {!complete ? (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    Please ask a member of staff
                                  </span>
                                ) : present.length === 0 ? (
                                  <span className="text-xs text-gray-500">No declared allergens</span>
                                ) : (
                                  present.map(({ key, state }) => {
                                    const s = allergenLook(state)
                                    return (
                                      <span
                                        key={key}
                                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}></span>
                                        {ALLERGEN_LABELS[key]}
                                      </span>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                            <span className="text-gray-400 text-lg leading-none mt-1">
                              {isExpanded ? '−' : '+'}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 bg-gray-50">
                            {/* The breakdown below is worked out from the
                                ingredients, so if one of them could not be read
                                it is incomplete and saying nothing about that
                                would be worse than saying nothing at all. */}
                            {!complete && (
                              <div className="bg-amber-100 border border-amber-300 text-amber-900 text-xs rounded-lg p-3 mt-2">
                                We cannot confirm the full allergen list for this dish right now. Please ask a member of staff before ordering it.
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {ALLERGEN_KEYS.map(key => {
                                const state = itemAllergens[key]
                                const s = allergenLook(state)
                                const colour = s ? `${s.bg} ${s.text} border border-current/20` : 'bg-white text-gray-400 border border-gray-200'
                                const label = s ? s.label : 'Not present'
                                return (
                                  // Stacked on a phone, side by side from the
                                  // small breakpoint up. Two of these fit across
                                  // a phone, and at that width a long name like
                                  // Crustaceans and a long state like Not
                                  // present were pushed into each other with
                                  // nothing between them. This is an allergen
                                  // list, so a customer being unsure which word
                                  // goes with which allergen is the one thing it
                                  // must never do.
                                  <div
                                    key={key}
                                    className={`flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 text-xs px-3 py-2 rounded-lg ${colour}`}
                                  >
                                    <span className="font-medium">{ALLERGEN_LABELS[key]}</span>
                                    <span>{label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
        </div>
    )
}
