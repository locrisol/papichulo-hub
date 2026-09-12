import { useState } from 'react'
import { fmtMoney } from '../lib/format'
import { slicePath } from '../lib/donut'

// What a finished stock take came to, by where it was counted.
//
// It leads the page because it is the answer. Everything under it is the
// working, and a hundred and sixty products is a long way to scroll for five
// numbers and a total.
//
// Bars are the default because the job is comparing sizes, and a bar is read
// off a common baseline where a pie is read off angles, which people are
// measurably worse at. The pie is there because it is the shape a split is
// usually pictured in. Same two views and the same donut as the dashboard, so
// the two charts in the app work the same way.
//
// The list and the chart are one thing. A chart above a table repeating the
// same five numbers would be the same five numbers twice.
//
// No chart library, same as the dashboard. The bars are divs and the donut is
// the only part with any geometry in it.
export default function StockTakeValue({ summary }) {
    const [view, setView] = useState('bars')

    const { sections, food, total, owners } = summary

    if (sections.length === 0) {
        return (
            <p className="text-sm text-gray-400 italic">
                Nothing was counted, so there is nothing to draw.
            </p>
        )
    }

    // The biggest section sets the scale, so the longest bar always fills the
    // width. Measured against the total instead, a count where nothing came to
    // much more than a third of it would draw as a row of stubs. The share
    // beside every bar is the honest number.
    const biggest = Math.max(...sections.map(s => s.value))

    const foodSections = food ? sections.filter(s => food.sections.includes(s.section)) : []
    const rest = food ? sections.filter(s => !food.sections.includes(s.section)) : sections

    const toggle = (value, label) => (
        <button
            type="button"
            onClick={() => setView(value)}
            aria-pressed={view === value}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                view === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
        >
            {label}
        </button>
    )

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h2 className="font-serif text-lg font-bold text-gray-900">Where the value is</h2>
                <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1" role="group" aria-label="How to show this">
                    {toggle('bars', 'Bars')}
                    {toggle('pie', 'Pie')}
                </div>
            </div>

            {view === 'bars' && (
                <>
                    {food ? (
                        <>
                            {/* The three food sections keep their own rows, with
                                a line down the side holding them together and a
                                subtotal closing them off. Both readings on
                                screen at once and nothing to press: the
                                accountant wants Food, the count is walked by
                                section. */}
                            <div className="border-l-2 border-gray-200 pl-3">
                                <ul>
                                    {foodSections.map(s => <Row key={s.section} section={s} biggest={biggest} />)}
                                </ul>
                                <div className="border-t border-dashed border-border mt-1 pt-1">
                                    <Row
                                        section={{
                                            section: 'Food',
                                            value: food.value,
                                            share: food.share,
                                            count: null,
                                            note: `${food.sections.length} sections`,
                                        }}
                                        biggest={Math.max(biggest, food.value)}
                                        stripe={foodSections}
                                        strong
                                    />
                                </div>
                            </div>
                            <ul className="mt-1">
                                {rest.map(s => <Row key={s.section} section={s} biggest={biggest} />)}
                            </ul>
                        </>
                    ) : (
                        <ul>{sections.map(s => <Row key={s.section} section={s} biggest={biggest} />)}</ul>
                    )}
                </>
            )}

            {view === 'pie' && <Pie sections={sections} food={food} total={total} />}

            <div className="flex items-baseline justify-between gap-3 border-t border-border mt-3 pt-3">
                <span className="font-serif font-bold text-gray-900">Grand total</span>
                <span className="font-serif text-xl font-bold text-gray-900 whitespace-nowrap">{fmtMoney(total)}</span>
            </div>

            {/* Whose stock this actually is.
                Pita Pit keep their boxes in our packaging cupboard, and on a
                count where that is a quarter of the total the grand total on
                its own says the business is holding stock it does not own.
                Only shown when somebody else's stock was counted. */}
            {owners && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border mt-2.5 pt-2.5 text-sm text-muted">
                    <span>Ours <strong className="font-semibold text-gray-900">{fmtMoney(owners.ours)}</strong></span>
                    {owners.held.map(h => (
                        <span key={h.who}>
                            Held for {h.who} <strong className="font-semibold text-gray-900">{fmtMoney(h.value)}</strong>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

// One line of the summary, with or without a bar on it.
//
// The name sits in a column of its own width so every bar starts in the same
// place. Letting the name push the bar along meant Cold Room and Dry began at
// different points and the lengths could not be read against each other, which
// is the only reason to draw them.
//
// On a phone the bar drops onto its own line under the name. Sharing the line
// it had whatever was left over between the name and the money, which on a 360
// pixel screen is about a hundred pixels, and a bar drawn in a hundred pixels
// is not a bar.
function Row({ section, biggest, stripe, strong }) {
    const width = biggest > 0 ? Math.max((section.value / biggest) * 100, 1) : 0

    return (
        <li className="py-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="order-1 flex-1 sm:flex-none sm:w-40 flex items-baseline gap-1.5 min-w-0">
                    <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 self-center"
                        style={{ backgroundColor: section.ink || 'transparent' }}
                        aria-hidden="true"
                    />
                    <span className={`text-sm truncate ${strong ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                        {section.section}
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap">
                        {section.note ?? section.count}
                    </span>
                </span>

                <span className={`order-2 sm:order-3 w-24 flex-shrink-0 text-right text-sm tabular-nums whitespace-nowrap ${strong ? 'font-bold' : 'font-semibold'} text-gray-900`}>
                    {fmtMoney(section.value)}
                </span>
                <span className="order-3 sm:order-4 w-12 flex-shrink-0 text-right text-xs text-muted tabular-nums whitespace-nowrap">
                    {section.share.toFixed(1)}%
                </span>

                {/* Square where it starts and rounded where it ends, so the eye
                    reads the length off a common left edge. */}
                <span className="order-4 sm:order-2 w-full sm:w-auto sm:flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                    {stripe ? (
                        // The food bar is striped out of the sections it is made
                        // of, so it says what it is without a sixth colour
                        // having to be invented for it.
                        <span className="flex h-full rounded-r overflow-hidden" style={{ width: `${width}%` }}>
                            {stripe.map(s => (
                                <span
                                    key={s.section}
                                    className="block h-full"
                                    style={{ width: `${(s.value / section.value) * 100}%`, backgroundColor: s.ink }}
                                />
                            ))}
                        </span>
                    ) : (
                        <span
                            className="block h-full rounded-r"
                            style={{ width: `${width}%`, backgroundColor: section.ink }}
                        />
                    )}
                </span>
            </div>

            {section.parties && <Parties section={section} />}
        </li>
    )
}

// How a section divides between us and whoever else keeps stock in it. The row
// above stays the total, because the total is what came off the shelf.
function Parties({ section }) {
    return (
        <div className="pl-4 pt-0.5 space-y-0.5">
            {section.parties.map(party => (
                <div key={party.who || 'ours'} className="flex items-baseline gap-3 text-xs text-muted">
                    <span className="flex-1">{section.section} ({party.who || 'ours'})</span>
                    <span className="w-24 text-right font-semibold text-gray-700 tabular-nums">{fmtMoney(party.value)}</span>
                    <span className="w-12 flex-shrink-0" />
                </div>
            ))}
        </div>
    )
}

// The same numbers as a donut, with the total in the middle.
//
// The food sections are always the first ones drawn, because the order is the
// order the store is walked and they come first in it, so the band saying Food
// is one arc over the front of the circle rather than three.
function Pie({ sections, food, total }) {
    const angle = value => (total > 0 ? (value / total) * 360 : 0)

    // Where each slice starts is the money in front of it, added up again from
    // the beginning rather than carried along in a running total, so the last
    // slice ends exactly on the 360 mark.
    const drawn = sections.map((s, i) => {
        const before = sections.slice(0, i).reduce((sum, x) => sum + x.value, 0)
        return { ...s, path: slicePath(angle(before), angle(before + s.value), 44, 26) }
    })

    return (
        <div className="flex flex-col sm:flex-row items-center gap-6">
            <svg
                viewBox="0 0 100 100"
                className="w-44 h-44 flex-shrink-0"
                role="img"
                aria-label={`The count by section, ${sections.length} parts. Every part is listed beside the chart with its name and value.`}
            >
                {drawn.map(s => (
                    <path key={s.section} d={s.path} fill={s.ink} stroke="#ffffff" strokeWidth="1">
                        <title>{`${s.section}: ${fmtMoney(s.value)}, ${s.share.toFixed(1)}%`}</title>
                    </path>
                ))}

                {food && (
                    <path d={slicePath(0, angle(food.value), 49, 46.5)} fill="#57524A">
                        <title>{`Food: ${fmtMoney(food.value)}, ${food.share.toFixed(1)}%`}</title>
                    </path>
                )}

                <text x="50" y="47" textAnchor="middle" className="fill-gray-500" style={{ fontSize: '6px' }}>
                    Counted
                </text>
                <text x="50" y="56" textAnchor="middle" className="fill-gray-900 font-semibold" style={{ fontSize: '8.5px' }}>
                    {fmtMoney(total)}
                </text>
            </svg>

            <ul className="flex-1 w-full">
                {sections.map(s => (
                    <li key={s.section} className="py-0.5">
                        <div className="flex items-baseline gap-3">
                            <span className="flex items-baseline gap-1.5 flex-1 min-w-0">
                                <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 self-center"
                                    style={{ backgroundColor: s.ink }}
                                    aria-hidden="true"
                                />
                                <span className="text-sm font-medium text-gray-800 truncate">{s.section}</span>
                            </span>
                            <span className="w-24 text-right text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                                {fmtMoney(s.value)}
                            </span>
                            <span className="w-12 text-right text-xs text-muted tabular-nums whitespace-nowrap">
                                {s.share.toFixed(1)}%
                            </span>
                        </div>
                        {s.parties && <Parties section={s} />}
                    </li>
                ))}

                {food && (
                    <li className="border-t border-dashed border-border mt-1 pt-1.5">
                        <div className="flex items-baseline gap-3">
                            <span className="flex items-baseline gap-1.5 flex-1 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 self-center" style={{ backgroundColor: '#57524A' }} aria-hidden="true" />
                                <span className="text-sm font-bold text-gray-900">Food</span>
                                <span className="text-xs text-muted">{food.sections.length} sections</span>
                            </span>
                            <span className="w-24 text-right text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">
                                {fmtMoney(food.value)}
                            </span>
                            <span className="w-12 text-right text-xs text-muted tabular-nums whitespace-nowrap">
                                {food.share.toFixed(1)}%
                            </span>
                        </div>
                    </li>
                )}
            </ul>
        </div>
    )
}
