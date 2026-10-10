import { useState } from 'react'
import { fmtMoney } from '@/lib/format'
import { numberField } from '@/lib/numberInput'
import { brandFor } from '@/lib/platformBrand'
import {
    ratingMove, reviewNeedsNote, saidNothing, claimState, claimAnswer, withClaim, weeksOpen,
    CLAIM_STATES, CLAIM_ANSWERS,
} from '@/lib/weeklyReport'
import { dayMonth } from '@/lib/dates'
import { useRemoveCard } from '@/components/reports/useRemoveCard'
import {
    removeButton, denseField, segmentTrack, segmentTrackFour, segmentButton, toneBadge,
} from '@/lib/controlStyles'
import AutoTextarea from '@/components/ui/AutoTextarea'
import AddButton from '@/components/ui/AddButton'

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

// A note box still waiting on its words: a low review or a refund with
// nothing said about it. The orange edge askField gives a full size box,
// swapped in rather than laid on top, since two border colours on one box
// are settled by stylesheet order.
const askDense = `${denseField.replace('border-border', 'border-accent')} placeholder:text-accent-ink`

const STAR_FULL = '★'
const STAR_EMPTY = '☆'

function Stars({ value, onChange, readOnly }) {
    return (
        <span className="inline-flex items-center" role={readOnly ? undefined : 'radiogroup'}>
            {[1, 2, 3, 4, 5].map(n => (
                readOnly ? (
                    <span key={n} className={n <= value ? 'text-amber-500' : 'text-muted'}>
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
                            n <= value ? 'text-amber-500' : 'text-muted hover:text-amber-300'}`}
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
function LineCard({ head, note, foot, warn, onRemove }) {
    return (
        <div className={`rounded-lg border bg-white px-3 py-2 ${
            warn ? 'border-accent/50' : 'border-border'}`}>
            {/* Wrapping, because a refund row is five things: a euro sign, the
                box, the money it comes to, whether it was claimed back, and the
                remove. Held on one line at 390px the box came out about seventy
                pixels and the claimed button was pushed half off the card. They
                take two lines now when they need to. */}
            <div className="flex flex-wrap items-center gap-2">
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
            {foot && <div className="mt-2">{foot}</div>}
        </div>
    )
}

// What a refund cost, typed as a plain positive number and shown as money
// going out.
//
// It has its own draft rather than saving on every keystroke. Saving as you
// type looks harmless until somebody types a decimal: "2." is not a number, it
// comes back as 2, the box redraws as "2", and the point is eaten before the
// 4 and the 7 are typed. The result was a box that silently refused anything
// but whole euro.
//
// You type 2.47 and it reads back as -€2.47. Nobody should have to type a
// minus sign to say that money went back out, and a refund shown as a positive
// figure beside three other positive figures reads as more money taken.
function RefundAmount({ item, canEdit, onSave }) {
    const [draft, setDraft] = useState(item.amount == null ? '' : String(item.amount))
    const amount = Number(item.amount) || 0

    async function commit() {
        const next = draft === '' ? 0 : Number(draft)
        if (Math.abs(next - amount) < 0.005) return
        await onSave(item.id, { amount: next })
    }

    if (!canEdit) {
        return (
            <span className="text-sm font-semibold tabular-nums text-red-700">
                {fmtMoney(-Math.abs(amount))}
            </span>
        )
    }

    return (
        <>
            <span className="text-sm text-muted">&euro;</span>
            <input
                {...numberField({ value: draft, onChange: setDraft, decimals: 2 })}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                placeholder="0.00"
                aria-label="How much was refunded"
                // Takes the room on a phone, where nothing else is competing
                // for the line, and goes back to its own width from sm. w-20 is
                // about four characters at this foot rule, which is not enough
                // for a refund that runs into three figures.
                className="flex-1 min-w-[5rem] sm:flex-none sm:w-24 text-right bg-white border border-gray-300 rounded-lg px-2 py-2 text-base pointer-fine:text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {amount > 0 && (
                <span className="text-sm font-semibold tabular-nums text-red-700 whitespace-nowrap">
                    {fmtMoney(-Math.abs(amount))}
                </span>
            )}
        </>
    )
}

// What came of a refund claim. See claimState in weeklyReport.
//
// A refund and a refund paid back are two different amounts of money lost,
// and claimed is only asking. Not claimed is the default because that is what
// a refund is until somebody does something about it, and a default of
// claimed would quietly flatter the week.
//
// One row of choices, coloured by what the answer means, so a refused claim
// reads red without anybody reading the word.
const CLAIM = {
    none: { label: 'None', said: 'Not claimed', tone: 'plain' },
    waiting: { label: 'Waiting', said: 'Claimed, waiting', tone: 'wait' },
    back: { label: 'Paid back', said: 'Paid back', tone: 'good' },
    refused: { label: 'Refused', said: 'Refused', tone: 'bad' },
}

function ClaimChoice({ value, choices, canEdit, onPick, label }) {
    if (!canEdit) {
        return value
            ? <span className={toneBadge(CLAIM[value].tone)}>{CLAIM[value].said}</span>
            : <span className={toneBadge()}>Not answered yet</span>
    }
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs text-muted">{label}</span>
            <div className={choices.length > 3 ? segmentTrackFour : segmentTrack} role="radiogroup" aria-label={label}>
                {choices.map(c => (
                    <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={value === c}
                        onClick={() => { if (value !== c) onPick(c) }}
                        className={segmentButton(value === c, true, CLAIM[c].tone)}
                    >
                        {CLAIM[c].label}
                    </button>
                ))}
            </div>
        </div>
    )
}

// A claim from an earlier week still waiting on the platform. It needs an
// answer before this week can go out, and Waiting carries it again.
function CarriedClaim({ item, weekStart, canEdit, onSave }) {
    const answer = claimAnswer(item)
    const weeks = weeksOpen(item, weekStart)
    return (
        <LineCard
            warn={!answer}
            head={
                <>
                    <span className="text-sm font-semibold tabular-nums text-red-700 whitespace-nowrap">
                        {fmtMoney(-Math.abs(Number(item.amount) || 0))}
                    </span>
                    <span className="text-xs text-muted">
                        Claimed in the week of {dayMonth(item.opened_on)}
                        {weeks > 1 ? `, ${weeks} weeks ago` : ''}
                    </span>
                </>
            }
            note={item.note ? <span className="text-sm text-gray-700">{item.note}</span> : null}
            foot={
                <>
                    <ClaimChoice
                        value={answer}
                        choices={CLAIM_ANSWERS}
                        canEdit={canEdit}
                        label="Answer"
                        onPick={c => onSave(item.id, { meta: { ...(item.meta || {}), answer: c } })}
                    />
                    {canEdit && !answer && (
                        <p className="text-xs text-accent-ink mt-1">
                            Say what came of it before sending. Waiting keeps it on next week&apos;s report.
                        </p>
                    )}
                </>
            }
        />
    )
}

// "No reviews" or "No refunds" this week. The report cannot go out until each
// online platform has one entered or this pressed, because an empty list could
// be a quiet week or nobody having looked. Shown only while there are none;
// one entered says it instead. The same look as Claimed, the other switch on
// these cards.
function NothingSwitch({ said, label, canEdit, onToggle }) {
    if (!canEdit) return <p className="text-sm text-muted">None this week.</p>
    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                role="switch"
                aria-checked={said}
                onClick={onToggle}
                className={`inline-flex items-center gap-1.5 min-h-[2.25rem] px-2.5 rounded-lg
                    text-xs font-semibold whitespace-nowrap border transition-colors
                    focus:outline-none focus:ring-2 focus:ring-accent ${
                    said
                        ? 'border-green-700 bg-green-50 text-green-700'
                        : 'border-gray-300 bg-white text-muted hover:border-gray-400'}`}
            >
                <span aria-hidden="true">{said ? '✓' : '○'}</span>
                {label}
            </button>
            {!said && <span className="text-xs text-accent-ink">Add one, or press this before sending.</span>}
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
                <div className="w-20">
                    <input
                        {...numberField({ value: draft, onChange: setDraft, decimals: 1 })}
                        onBlur={commit}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        placeholder="4.6"
                        className={`${denseField} text-right tabular-nums`}
                    />
                </div>
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
    platform, taken, rating, reviews, refunds, claims, weekStart, canEdit,
    onSaveRating, onSaveNothing, onAddReview, onAddRefund, onSaveItem, onRemoveItem,
}) {
    const brand = brandFor(platform.name)
    const removeCard = useRemoveCard()
    // Shown beside the heading, not typed anywhere. The cards are still the
    // record of what each one was for.
    const refundTotal = refunds.reduce((t, r) => t + Math.abs(Number(r.amount) || 0), 0)
    const sumOf = list => list.reduce((t, r) => t + Math.abs(Number(r.amount) || 0), 0)
    const claimed = sumOf(refunds.filter(r => claimState(r) !== 'none'))
    const paidBack = sumOf(refunds.filter(r => claimState(r) === 'back'))
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
                                        <span className="text-xs font-semibold text-accent-ink whitespace-nowrap">
                                            needs a comment
                                        </span>
                                    )}
                                </>
                            }
                            note={canEdit ? (
                                <AutoTextarea
                                    defaultValue={item.note || ''}
                                    onBlur={e => {
                                        const note = e.target.value.trim()
                                        if (note !== (item.note || '')) onSaveItem(item.id, { note })
                                    }}
                                    placeholder={needs ? 'Enter a comment' : 'Enter a comment (optional)'}
                                    className={needs ? askDense : denseField}
                                />
                            ) : item.note ? (
                                <span className="text-sm text-gray-700">{item.note}</span>
                            ) : null}
                        />
                    )
                })}

                {reviews.length === 0 && (
                    <NothingSwitch
                        said={saidNothing(rating, 'reviews')}
                        label="No reviews this week"
                        canEdit={canEdit}
                        onToggle={() => onSaveNothing(platform, 'reviews', !saidNothing(rating, 'reviews'))}
                    />
                )}
            </div>

            {canEdit && (
                <div className="mt-2">
                    <div className="flex items-center gap-2">
                        <Stars value={stars} onChange={setStars} />
                        <span className="text-sm text-muted">&times;</span>
                        <div className="w-14">
                            <input
                                {...numberField({ value: count, onChange: setCount, whole: true })}
                                aria-label="How many of them"
                                className={`${denseField} text-right tabular-nums`}
                            />
                        </div>
                    </div>
                    <AddButton
                        className="mt-2 w-full sm:w-auto justify-center"
                        onClick={async () => {
                            await onAddReview(platform, stars, Math.max(1, Number(count) || 1))
                            setStars(5)
                            setCount('1')
                        }}
                    >
                        Add review
                    </AddButton>
                </div>
            )}

            <p className="text-xs text-muted mt-2">
                Reviews of three stars or less need a comment before the report can be sent.
            </p>

            {/* Claimed, not claimed back: a claim is asking (his, 7 October). */}
            <SubLabel hint={refundTotal > 0
                ? `${fmtMoney(-refundTotal)} this week`
                    + (claimed > 0 ? `, ${fmtMoney(claimed)} claimed` : ', none claimed')
                    + (paidBack > 0 ? `, ${fmtMoney(paidBack)} paid back` : '')
                : 'add each refund separately'}>Refunds</SubLabel>
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
                        head={<RefundAmount item={item} canEdit={canEdit} onSave={onSaveItem} />}
                        foot={
                            <ClaimChoice
                                value={claimState(item)}
                                choices={CLAIM_STATES}
                                canEdit={canEdit}
                                label="Claim"
                                onPick={c => onSaveItem(item.id, { meta: withClaim(item.meta, c) })}
                            />
                        }
                        note={canEdit ? (
                            <AutoTextarea
                                defaultValue={item.note || ''}
                                onBlur={e => {
                                    const note = e.target.value.trim()
                                    if (note !== (item.note || '')) onSaveItem(item.id, { note })
                                }}
                                placeholder="What it was about"
                                className={String(item.note || '').trim() ? denseField : askDense}
                            />
                        ) : item.note ? (
                            <span className="text-sm text-gray-700">{item.note}</span>
                        ) : null}
                    />
                ))}

                {refunds.length === 0 && (
                    <NothingSwitch
                        said={saidNothing(rating, 'refunds')}
                        label="No refunds this week"
                        canEdit={canEdit}
                        onToggle={() => onSaveNothing(platform, 'refunds', !saidNothing(rating, 'refunds'))}
                    />
                )}
            </div>

            {canEdit && (
                <AddButton onClick={() => onAddRefund(platform)} className="mt-2">
                    Add a refund
                </AddButton>
            )}

            <Claims claims={claims} weekStart={weekStart} canEdit={canEdit} onSaveItem={onSaveItem} />
        </div>
    )
}

// Claims from earlier weeks, under the platform they were claimed from.
function Claims({ claims, weekStart, canEdit, onSaveItem }) {
    if (!claims.length) return null
    return (
        <>
            <SubLabel hint={`${claims.length} ${claims.length === 1 ? 'claim' : 'claims'}, `
                + fmtMoney(claims.reduce((t, c) => t + Math.abs(Number(c.amount) || 0), 0))}>
                Claims from earlier weeks
            </SubLabel>
            <div className="space-y-2">
                {claims.map(c => (
                    <CarriedClaim key={c.id} item={c} weekStart={weekStart} canEdit={canEdit} onSave={onSaveItem} />
                ))}
            </div>
        </>
    )
}

export default function ReportOnlineSales({ section, platforms, taken, weekStart, canEdit, handlers }) {
    const total = platforms.reduce((t, p) => t + (taken[p.id] || 0), 0)

    const byKind = kind => section.items.filter(i => i.kind === kind)
    const forPlatform = (items, p) => items.filter(i => i.key === p.id)
    // A claim on a platform no longer set up still has to be answered, so it
    // is shown on its own rather than lost with the platform.
    const known = new Set(platforms.map(p => p.id))
    const strays = byKind('refund_claim').filter(c => !known.has(c.key))

    return (
        <div>
            <p className="text-sm text-muted mb-4">
                Takings come from the Online platforms rows on Weekly sales. Enter ratings, reviews and refunds
                here, from each platform's own app.
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
                        claims={forPlatform(byKind('refund_claim'), p)}
                        weekStart={weekStart}
                        canEdit={canEdit}
                        {...handlers}
                    />
                ))}
            </div>

            {strays.length > 0 && (
                <div className="rounded-xl border border-border bg-app-bg p-4 mt-3">
                    <p className="text-sm text-muted">
                        From {[...new Set(strays.map(c => c.label))].join(', ')}, no longer set up here.
                    </p>
                    <Claims claims={strays} weekStart={weekStart} canEdit={canEdit} onSaveItem={handlers.onSaveItem} />
                </div>
            )}

            {platforms.length === 0 && (
                <p className="text-sm text-muted">No online platforms are set up for this restaurant yet.</p>
            )}
        </div>
    )
}
