import { useState } from 'react'
import { fmtMoney } from '../../lib/format'
import { numberField } from '../../lib/numberInput'
import { brandFor } from '../../lib/platformBrand'
import { ratingMove, reviewNeedsNote } from '../../lib/weeklyReport'
import { useRemoveCard } from './useRemoveCard'
import { removeButton } from '../../lib/controlStyles'

// Online sales, one block per platform.
//
// Three lines each, in the order they are read: what it is rated, what came in
// this week, and what went back out. They used to be one row of chips, and a
// note about a one star review could then be read as a note about a refund.
//
// Refunds are one card each, an amount and what it was about. Never a total: a
// total cannot say what it was for, and what it was for is the only part worth
// reading. Reviews are one card each for the same reason.
//
// The rating carries from last week and the report only mentions one that
// moved. A score that held is not news.

const STAR_FULL = '★'
const STAR_EMPTY = '☆'

function Stars({ value, onChange, readOnly }) {
    return (
        <span className="inline-flex items-center" role={readOnly ? undefined : 'radiogroup'}>
            {[1, 2, 3, 4, 5].map(n => (
                readOnly ? (
                    <span key={n} className={n <= value ? 'text-amber-500' : 'text-gray-300'}>
                        {n <= value ? STAR_FULL : STAR_EMPTY}
                    </span>
                ) : (
                    <button
                        key={n}
                        type="button"
                        onClick={() => onChange(n)}
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                        aria-checked={n === value}
                        role="radio"
                        // Big enough for a thumb. A five star picker built from
                        // text-sized targets is unusable on a phone.
                        className={`px-1 py-0.5 text-lg leading-none transition-colors ${
                            n <= value ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'}`}
                    >
                        {n <= value ? STAR_FULL : STAR_EMPTY}
                    </button>
                )
            ))}
        </span>
    )
}

function SubLabel({ children, hint }) {
    return (
        <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-4 mb-1.5 flex flex-wrap items-center gap-2">
            {children}
            {hint && (
                <span className="normal-case tracking-normal font-normal text-xs">{hint}</span>
            )}
        </p>
    )
}

// A card is two rows: what it is, then what was said about it.
//
// They were one wrapping row, and on a phone the note box came out about eight
// characters wide, sharing a line with five stars, a count and a remove button.
// A comment nobody can read back while typing it is a comment nobody writes.
function LineCard({ head, note, warn, onRemove }) {
    return (
        <div className={`rounded-lg border bg-white px-3 py-2 ${
            warn ? 'border-accent/50' : 'border-border'}`}>
            <div className="flex items-center gap-2">
                {head}
                {onRemove && (
                    <button
                        onClick={onRemove}
                        aria-label="Remove"
                        className={removeButton}
                    >
                        &times;
                    </button>
                )}
            </div>
            {note && <div className="mt-2">{note}</div>}
        </div>
    )
}

function RatingLine({ platform, item, canEdit, onSave }) {
    const [draft, setDraft] = useState(item?.amount == null ? '' : String(item.amount))
    const move = ratingMove(item)

    async function commit() {
        const next = draft === '' ? null : Number(draft)
        const now = item?.amount == null ? null : Number(item.amount)
        if (next === now) return
        await onSave(platform, next)
    }

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {canEdit ? (
                <input
                    {...numberField({ value: draft, onChange: setDraft })}
                    onBlur={commit}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="4.6"
                    className="w-20 text-right bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                />
            ) : (
                <span className="text-sm font-bold tabular-nums text-gray-900">
                    {item?.amount == null ? '—' : Number(item.amount).toFixed(1)}
                </span>
            )}
            <span className="text-xs text-muted">out of 5</span>

            {move ? (
                <span className={`text-xs font-semibold ${move.up ? 'text-green-700' : 'text-red-600'}`}>
                    {move.up ? '↑' : '↓'} {move.up ? 'up' : 'down'} from {move.from.toFixed(1)}, the report will say so
                </span>
            ) : item?.carried_from != null ? (
                <span className="text-xs text-muted">No change since last week</span>
            ) : (
                <span className="text-xs text-muted">Carries to next week once set</span>
            )}
        </div>
    )
}

function PlatformBlock({
    platform, taken, rating, reviews, refunds, canEdit,
    onSaveRating, onAddReview, onAddRefund, onSaveItem, onRemoveItem,
}) {
    const brand = brandFor(platform.name)
    const removeCard = useRemoveCard()
    const [stars, setStars] = useState(5)
    const [count, setCount] = useState('1')

    return (
        <div
            className="rounded-xl border border-border border-l-4 bg-app-bg p-4"
            style={{ borderLeftColor: brand.mark }}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 font-bold text-base" style={{ color: brand.ink }}>
                    <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: brand.mark }}
                        aria-hidden="true"
                    />
                    {platform.name}
                </span>
                <span className="font-serif text-lg font-bold text-sidebar tabular-nums">
                    {fmtMoney(taken)}
                </span>
            </div>

            <SubLabel hint={rating?.carried_from != null ? 'held from last week' : null}>
                Overall rating
            </SubLabel>
            <RatingLine platform={platform} item={rating} canEdit={canEdit} onSave={onSaveRating} />

            <SubLabel>New reviews</SubLabel>
            <div className="space-y-2">
                {reviews.map(item => {
                    const needs = reviewNeedsNote(item)
                    return (
                        <LineCard
                            key={item.id}
                            warn={needs}
                            onRemove={canEdit ? () => removeCard({
                                what: 'review',
                                holds: item.note,
                                onRemove: () => onRemoveItem(item.id),
                            }) : null}
                            head={
                                <>
                                    <Stars value={Number(item.meta?.stars) || 0} readOnly />
                                    <span className="text-sm tabular-nums text-gray-700 whitespace-nowrap">
                                        &times; {item.meta?.count || 1}
                                    </span>
                                    {needs && (
                                        <span className="text-xs font-semibold text-accent-ink">
                                            needs a comment
                                        </span>
                                    )}
                                </>
                            }
                            note={canEdit ? (
                                <input
                                    defaultValue={item.note || ''}
                                    onBlur={e => {
                                        const note = e.target.value.trim()
                                        if (note !== (item.note || '')) onSaveItem(item.id, { note })
                                    }}
                                    placeholder={needs ? 'What did they say' : 'Anything worth saying'}
                                    className={`w-full bg-white border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent ${
                                        needs ? 'border-accent placeholder:text-accent-ink' : 'border-gray-300'}`}
                                />
                            ) : item.note ? (
                                <span className="text-sm text-gray-700">{item.note}</span>
                            ) : null}
                        />
                    )
                })}

                {reviews.length === 0 && (
                    <p className="text-sm text-muted">None this week.</p>
                )}
            </div>

            {canEdit && (
                <div className="mt-2">
                    <div className="flex items-center gap-2">
                        <Stars value={stars} onChange={setStars} />
                        <span className="text-sm text-muted">&times;</span>
                        <input
                            {...numberField({ value: count, onChange: setCount, whole: true })}
                            aria-label="How many of them"
                            className="w-14 text-right bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                    </div>
                    <button
                        onClick={async () => {
                            await onAddReview(platform, stars, Math.max(1, Number(count) || 1))
                            setStars(5)
                            setCount('1')
                        }}
                        className="mt-2 w-full sm:w-auto px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 transition-colors"
                    >
                        Add review
                    </button>
                </div>
            )}

            <p className="text-xs text-muted mt-2">
                Three stars or under needs a comment before the week can go out. Four and five do not, because a
                good review needs no explaining.
            </p>

            <SubLabel hint="one card each, never a total">Refunds</SubLabel>
            <div className="space-y-2">
                {refunds.map(item => (
                    <LineCard
                        key={item.id}
                        warn={!String(item.note || '').trim()}
                        onRemove={canEdit ? () => removeCard({
                            what: 'refund',
                            holds: item.note,
                            onRemove: () => onRemoveItem(item.id),
                        }) : null}
                        head={canEdit ? (
                            <>
                                <span className="text-sm text-muted">&euro;</span>
                                <input
                                    {...numberField({
                                        value: item.amount == null ? '' : String(item.amount),
                                        onChange: v => onSaveItem(item.id, { amount: v === '' ? 0 : Number(v) }),
                                    })}
                                    aria-label="How much was refunded"
                                    className="w-24 text-right bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                                {!String(item.note || '').trim() && (
                                    <span className="text-xs font-semibold text-accent-ink">needs a note</span>
                                )}
                            </>
                        ) : (
                            <span className="text-sm font-semibold tabular-nums">{fmtMoney(item.amount)}</span>
                        )}
                        note={canEdit ? (
                            <input
                                defaultValue={item.note || ''}
                                onBlur={e => {
                                    const note = e.target.value.trim()
                                    if (note !== (item.note || '')) onSaveItem(item.id, { note })
                                }}
                                placeholder="What it was about"
                                className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                        ) : item.note ? (
                            <span className="text-sm text-gray-700">{item.note}</span>
                        ) : null}
                    />
                ))}

                {refunds.length === 0 && <p className="text-sm text-muted">None this week.</p>}
            </div>

            {canEdit && (
                <button
                    onClick={() => onAddRefund(platform)}
                    className="mt-2 text-sm font-semibold text-accent-ink hover:underline"
                >
                    + Add a refund
                </button>
            )}
        </div>
    )
}

export default function ReportOnlineSales({ section, platforms, taken, canEdit, handlers }) {
    const total = platforms.reduce((t, p) => t + (taken[p.id] || 0), 0)

    const byKind = kind => section.items.filter(i => i.kind === kind)
    const forPlatform = (items, p) => items.filter(i => i.key === p.id)

    return (
        <div>
            <p className="text-sm text-muted mb-4">
                Takings come from the tracking rows on weekly sales, the ones filled by hand beside the till,
                because that is what a platform statement is reconciled against. Everything else here is only
                known to whoever looked at the app.
            </p>

            <div className="rounded-lg bg-sidebar text-white px-4 py-3 mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-75">Online revenue</span>
                <span className="font-serif text-2xl font-bold tabular-nums">{fmtMoney(total)}</span>
            </div>

            <div className="space-y-3">
                {platforms.map(p => (
                    <PlatformBlock
                        key={p.id}
                        platform={p}
                        taken={taken[p.id] || 0}
                        rating={byKind('rating').find(i => i.key === p.id)}
                        reviews={forPlatform(byKind('review'), p)}
                        refunds={forPlatform(byKind('refund'), p)}
                        canEdit={canEdit}
                        {...handlers}
                    />
                ))}
            </div>

            {platforms.length === 0 && (
                <p className="text-sm text-muted">No online platforms are set up for this restaurant yet.</p>
            )}
        </div>
    )
}
