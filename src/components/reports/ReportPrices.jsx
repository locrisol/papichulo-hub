import { useState } from 'react'
import { fmtMoney } from '@/lib/format'
import { shortDate } from '@/lib/dates'
import { CLAIM_KINDS } from '@/lib/invoiceClaims'
import { decisionsFrom } from '@/lib/invoiceReport'
import { renumberPlan } from '@/lib/priceEvents'
import {
    badge, rowButton, compactField, tableHeadRow, tableHeadCell,
} from '@/lib/controlStyles'

// Prices and suppliers, on the weekly report.
//
// Agreed on 25 September 2026 from four drawings: four figures an owner reads
// in five seconds, then a card for each kind of thing with every row still
// listed, the things somebody has to decide in a box on top, and the whole
// ledger folded away underneath for anybody checking against the paper.
//
// Everything it says is worked out in invoiceReport.js, and on a report that
// has gone out it is read from what was frozen, so the page and the mail can
// never tell the week two ways.

const TILE = {
    down: 'bg-green-50 border-green-200',
    up: 'bg-red-50 border-red-200',
    warn: 'bg-amber-50 border-amber-200',
    back: 'bg-app-bg border-border',
    quiet: 'bg-white border-border',
}

const PILL = {
    up: 'bg-red-50 text-red-700 border-red-200',
    down: 'bg-green-50 text-green-700 border-green-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    grey: 'bg-gray-100 text-gray-700 border-gray-300',
}

const signed = n => `${n > 0 ? '+' : ''}${fmtMoney(n)}`
const pct = n => (n == null ? '' : `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}%`)
// Two places, always. Four was the precision prices are kept at, and on a
// report it only made every figure harder to read (his word, 26 September).
const priceText = value => fmtMoney(value)
const toneOf = n => (n > 0.004 ? 'up' : n < -0.004 ? 'down' : 'quiet')

const WHY = {
    weight: 'Recipes count it by weight and it is sold one at a time, so nothing on the invoice says what one weighs.',
    units: 'The price the Hub has and the invoice are not counted the same way. Worth checking the price on the product.',
}

export default function ReportPrices({
    section, canDecide, canEdit, busy, jobs, onCostFrom, onMakeUsual, onRenumber, onGiveReason, onPutOnList,
}) {
    if (!section) return null
    const t = section.totals || {}
    const decisions = canDecide ? decisionsFrom(section) : []

    return (
        <div>
            {/* Where it came from, before anything else: only a document read
                line by line says anything about a price. See readFrom. */}
            {section.readFrom && <ReadFrom words={section.readFrom.words} />}

            {decisions.length > 0 && (
                <Decisions
                    items={decisions}
                    busy={busy}
                    onCostFrom={onCostFrom}
                    onMakeUsual={onMakeUsual}
                    onRenumber={onRenumber}
                    onGiveReason={onGiveReason}
                />
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <Tile
                    tone={toneOf(t.moves)}
                    label="Same product, new price"
                    value={section.moves.length ? signed(t.moves) : 'None'}
                    sub={section.moves.length
                        ? `${section.moves.length} ${section.moves.length === 1 ? 'product' : 'products'}, `
                            + (t.movesUp && t.movesDown ? `${t.movesUp} up and ${t.movesDown} down`
                                : t.movesUp ? (t.movesUp === 1 ? 'up' : 'all up') : (t.movesDown === 1 ? 'cheaper' : 'all cheaper'))
                        : 'Every code cost what it did'}
                />
                <Tile
                    tone={toneOf(t.switches)}
                    label="Bought as something else"
                    value={section.switches.length ? signed(t.switches) : 'None'}
                    sub={section.switches.length
                        ? `${section.switches.length} ${section.switches.length === 1 ? 'product' : 'products'}`
                        : 'Everything was the usual one'}
                />
                <Tile
                    tone={t.recipes ? 'warn' : 'quiet'}
                    label="Recipes out of line"
                    value={String(t.recipes || 0)}
                    sub={t.cannot
                        ? `and ${t.cannot} that cannot be compared`
                        : `more than ${section.threshold}% off what we pay`}
                />
                <Tile
                    tone={section.back.length || t.owedCount ? 'back' : 'quiet'}
                    label="Came back"
                    value={fmtMoney(t.back)}
                    sub={`${section.back.length} credit ${section.back.length === 1 ? 'note' : 'notes'}`
                        + (t.owedCount ? `, ${t.owedCount} still owed` : '')}
                />
            </div>

            <WeekInShort section={section} />

            <Moves moves={section.moves} doubtful={section.doubtful || []} />
            <Switches switches={section.switches} />
            <Recipes recipes={section.recipes} checkedOn={section.checkedOn} threshold={section.threshold} />
            <Back
                back={section.back}
                reasons={section.reasons}
                owed={section.owed}
                total={t.back}
                canEdit={canEdit}
                jobs={jobs}
                busy={busy}
                onPutOnList={onPutOnList}
            />
            <NewCodes codes={section.newCodes} />
            <Ledger section={section} />
        </div>
    )
}

// ---------------------------------------------------------------------------
// The things somebody has to decide
// ---------------------------------------------------------------------------

function Decisions({ items, busy, onCostFrom, onMakeUsual, onRenumber, onGiveReason }) {
    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 sm:px-4 mb-4">
            <p className="text-sm font-bold text-amber-800">
                {items.length} {items.length === 1 ? 'thing' : 'things'} to decide
            </p>
            <div className="mt-1">
                {items.map(item => (
                    <Decision
                        key={`${item.kind}:${item.productId || item.id}:${item.code || ''}`}
                        item={item}
                        busy={busy}
                        onCostFrom={onCostFrom}
                        onMakeUsual={onMakeUsual}
                        onRenumber={onRenumber}
                        onGiveReason={onGiveReason}
                    />
                ))}
            </div>
            <p className="text-xs text-amber-800 mt-2">
                Nothing here has to be answered this week. Anything left is on next week&apos;s report too.
            </p>
        </div>
    )
}

function Decision({ item, busy, onCostFrom, onMakeUsual, onRenumber, onGiveReason }) {
    const [reason, setReason] = useState('')
    const key = `${item.kind}:${item.productId || item.id}:${item.code || ''}`
    // Each button has its own key, so the one pressed is the one that says so.
    const saving = action => busy === `${key}:${action}`

    let words
    let buttons
    if (item.kind === 'recipe') {
        const more = item.gap > 0
        words = (
            <>
                <b>{item.name}.</b> Recipes cost it at {fmtMoney(item.recipe)} {item.unit} and the last
                one, on {shortDate(item.paidOn)}, was {fmtMoney(item.paid)}: {Math.abs(item.gap).toFixed(0)}%{' '}
                {more ? 'more' : 'less'} than recipes say.
            </>
        )
        buttons = (
            <button type="button" disabled={!!busy} onClick={() => onCostFrom(item, `${key}:cost`)} className={rowButton('good')}>
                {saving('cost') ? 'Saving...' : `Cost from ${fmtMoney(item.paid)} ${item.unit}`}
            </button>
        )
    } else if (item.kind === 'usual') {
        words = (
            <>
                <b>{item.name}.</b> The last three deliveries were {item.bought} (code {item.code}), not the
                one recipes cost from. {item.renumbered && renumberPlan(item)
                    ? 'It reads like the same thing under a new number.'
                    : `Is it the usual one now? The Hub has it at ${fmtMoney(item.rowPer)} ${item.unit}.`}
            </>
        )
        buttons = (
            <>
                {item.renumbered && renumberPlan(item) && (
                    <button type="button" disabled={!!busy} onClick={() => onRenumber(item, `${key}:renumber`)} className={rowButton('good')}>
                        {saving('renumber') ? 'Saving...' : 'Same thing, this is a code update'}
                    </button>
                )}
                <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => onMakeUsual(item, `${key}:usual`)}
                    className={rowButton(item.renumbered && renumberPlan(item) ? 'plain' : 'good')}
                >
                    {saving('usual') ? 'Saving...' : 'Make it the usual one'}
                </button>
            </>
        )
    } else if (item.kind === 'renumbered') {
        words = (
            <>
                <b>{item.name}.</b> {item.bought} (code {item.code}) reads like {item.usualName}
                {item.usualCode ? ` (code ${item.usualCode})` : ''} under {item.newer ? 'a new' : 'an old'} number
                {item.change == null ? '.' : item.change === 0 ? ', at the same price.' : `, ${pct(item.change)} ${item.unit}.`}
            </>
        )
        buttons = (
            <button type="button" disabled={!!busy} onClick={() => onRenumber(item, `${key}:renumber`)} className={rowButton('good')}>
                {saving('renumber') ? 'Saving...' : 'Same thing, this is a code update'}
            </button>
        )
    } else {
        words = (
            <>
                <b>{item.what}</b>, {fmtMoney(item.unexplained)} back on {shortDate(item.date)}
                {item.number ? ` (${item.number})` : ''}. Nothing was logged at the door, so the report
                cannot say why.
            </>
        )
        buttons = (
            <>
                <label className="sr-only" htmlFor={`reason-${item.id}`}>Why it came back</label>
                <select
                    id={`reason-${item.id}`}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className={`${compactField} w-auto`}
                >
                    <option value="">Why?</option>
                    {/* Something else says what in a note at the door, and there
                        is no note here, so it would be no reason at all. */}
                    {CLAIM_KINDS.filter(kind => kind.value !== 'something_else').map(kind => (
                        <option key={kind.value} value={kind.value}>{kind.label}</option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={!!busy || !reason}
                    onClick={() => onGiveReason(item, reason, `${key}:reason`)}
                    className={rowButton('good')}
                >
                    {saving('reason') ? 'Saving...' : 'Give the reason'}
                </button>
            </>
        )
    }

    return (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] items-center py-2.5 border-t border-amber-200 first:border-t-0">
            <p className="text-sm text-gray-900">{words}</p>
            <div className="flex flex-wrap gap-2 sm:justify-end">{buttons}</div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// The four figures
// ---------------------------------------------------------------------------

function Tile({ tone, label, value, sub }) {
    return (
        <div className={`rounded-lg border px-3 py-2.5 ${TILE[tone] || TILE.quiet}`}>
            <p className="text-xs font-bold text-muted uppercase tracking-wider">{label}</p>
            <p className="font-serif text-2xl font-bold text-gray-900 tabular-nums mt-1 leading-tight">{value}</p>
            <p className="text-xs text-muted mt-1">{sub}</p>
        </div>
    )
}

// ---------------------------------------------------------------------------
// The week in short
// ---------------------------------------------------------------------------

// One row for each kind of thing, his choice on 26 September (A on the page).
//
// The sentences it replaced ran a supplier's long description, a product name
// and a percentage together three to a line. Here a label says what kind of
// thing it is, each product is a chip with its change, and the money sits on
// the right. Only the Hub's own name is used; the supplier's words are in the
// card underneath, where there is room for them.
const KIND = {
    down: 'bg-green-50 text-green-700 border-green-200',
    up: 'bg-red-50 text-red-700 border-red-200',
    grey: 'bg-gray-100 text-gray-700 border-gray-300',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    back: 'bg-green-50/60 text-green-800 border-green-200',
}

// How many chips a row shows before it says how many more there are.
const CHIPS = 4

function WeekInShort({ section }) {
    const t = section.totals || {}
    const moves = section.moves || []
    const doubtful = section.doubtful || []
    const switches = section.switches || []
    const recipes = section.recipes || []
    const reasons = section.reasons || []
    const owed = section.owed || []

    const movesKind = !moves.length ? 'grey' : t.movesUp && t.movesDown ? 'grey' : t.movesUp ? 'up' : 'down'
    const movesLabel = !moves.length ? 'Same code'
        : t.movesUp && t.movesDown ? 'New price, same code'
            : t.movesUp ? 'Dearer, same code' : 'Cheaper, same code'

    const compared = [...switches].filter(x => !x.cannot)
    const off = recipes.filter(r => r.state !== 'cannot')
    const cannot = recipes.filter(r => r.state === 'cannot')

    return (
        <div className="mt-4 rounded-lg border border-border overflow-hidden">
            <ShortRow
                kind={movesKind}
                label={movesLabel}
                quiet={moves.length || doubtful.length ? null : 'Every code cost what it did'}
                money={moves.length ? signed(t.moves) : null}
                under="this week"
            >
                {moves.slice(0, CHIPS).map(m => <Chip key={m.key} name={m.name} change={m.change} />)}
                {moves.length > CHIPS && <More count={moves.length - CHIPS} />}
                {doubtful.map(m => <Chip key={m.key} name={m.name} note="check the invoice" tone="warn" />)}
            </ShortRow>

            <ShortRow
                kind="grey"
                label="Bought instead"
                quiet={switches.length ? null : 'Everything was the usual one'}
                money={compared.length ? signed(t.switches) : null}
                under="against the usual"
            >
                {compared.slice(0, CHIPS).map(x => (
                    <Chip key={`${x.productId}:${x.code}`} name={x.name} change={x.change} />
                ))}
                {switches.length > Math.min(CHIPS, compared.length) && (
                    <More count={switches.length - Math.min(CHIPS, compared.length)} />
                )}
            </ShortRow>

            <ShortRow
                kind={off.length ? 'warn' : 'grey'}
                label="Recipes off"
                quiet={off.length || cannot.length ? null : `Every recipe is within ${section.threshold}% of what was paid`}
                money={String(off.length)}
            >
                {off.slice(0, CHIPS).map(r => <Chip key={r.productId} name={r.name} change={r.gap} />)}
                {off.length > CHIPS && <More count={off.length - CHIPS} />}
                {cannot.map(r => <Chip key={r.productId} name={r.name} note="can't compare" tone="grey" />)}
            </ShortRow>

            <ShortRow
                kind={section.back.length ? 'back' : 'grey'}
                label="Came back"
                quiet={reasons.length || owed.length ? null : 'Nothing came back this week'}
                money={fmtMoney(t.back)}
                under={`${section.back.length} credit ${section.back.length === 1 ? 'note' : 'notes'}`}
            >
                {reasons.map(r => (
                    <span key={r.kind} className={`${badge} border bg-white text-gray-700 border-gray-300 inline-flex items-center gap-1.5`}>
                        <i className="inline-block w-2 h-2 rounded-sm" style={{ background: r.colour }} />
                        {r.label} <b className="tabular-nums">{fmtMoney(r.money)}</b>
                    </span>
                ))}
                {owed.length > 0 && (
                    <span className={`${badge} border ${KIND.warn}`}>
                        {t.owed ? `${fmtMoney(t.owed)} still owed` : `${owed.length} still owed`}
                    </span>
                )}
            </ShortRow>
        </div>
    )
}

function ShortRow({ kind, label, quiet, money, under, children }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[10rem_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-center px-3 py-2.5 border-b border-border last:border-b-0">
            <span className={`${badge} border justify-self-start ${KIND[kind] || KIND.grey}`}>{label}</span>
            <div className="col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto flex flex-wrap gap-1.5 min-w-0">
                {quiet ? <span className="text-sm text-muted">{quiet}</span> : children}
            </div>
            <div className="text-right col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">
                {money != null && <p className="text-sm font-bold tabular-nums text-gray-900">{money}</p>}
                {money != null && under && <p className="text-xs text-muted">{under}</p>}
            </div>
        </div>
    )
}

function Chip({ name, change, note, tone }) {
    if (note) {
        return <span className={`${badge} border ${KIND[tone] || KIND.grey}`}>{name}, {note}</span>
    }
    return (
        <span className={`${badge} border bg-white text-gray-800 border-gray-300`}>
            {name}{' '}
            <b className={`tabular-nums ${change > 0 ? 'text-red-700' : change < 0 ? 'text-green-700' : 'text-gray-600'}`}>
                {change > 0 ? '+' : ''}{Math.round(change)}%
            </b>
        </span>
    )
}

function More({ count }) {
    return <span className={`${badge} border border-dashed border-gray-300 text-muted font-medium`}>+ {count} more</span>
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

function Card({ title, sub, empty, children, count }) {
    return (
        <div className="rounded-lg border border-border overflow-hidden mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2.5 bg-app-bg border-b border-border">
                <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                <p className="text-xs text-muted">{sub}</p>
            </div>
            {count ? children : <p className="px-3 py-2.5 text-sm text-muted">{empty}</p>}
        </div>
    )
}

function Row({ children }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_auto] gap-2 sm:gap-4 items-center px-3 py-2.5 border-b border-border last:border-b-0">
            {children}
        </div>
    )
}

// "Read from: Sysco Ireland (18 invoices ...)", the label in bold the way the
// mail sets its headlines.
function ReadFrom({ words }) {
    const at = words.indexOf(': ')
    return (
        <p className="text-sm text-gray-700 mb-3">
            {at === -1 ? words : <><b className="text-gray-900">{words.slice(0, at + 1)}</b> {words.slice(at + 2)}</>}
        </p>
    )
}

function Pill({ tone, children }) {
    return <span className={`${badge} border ${PILL[tone] || PILL.grey}`}>{children}</span>
}

function Money({ change, effect, under }) {
    return (
        <div className="sm:text-right flex sm:block items-center gap-3">
            {change != null && <Pill tone={change > 0 ? 'up' : change < 0 ? 'down' : 'grey'}>{pct(change)}</Pill>}
            <p className="text-sm font-bold tabular-nums text-gray-900 sm:mt-1">{signed(effect)}</p>
            {under && <p className="text-xs text-muted">{under}</p>}
        </div>
    )
}

function Moves({ moves, doubtful }) {
    return (
        <Card
            title="Same product, new price"
            sub="Against the last delivery of the same code"
            empty="Every code cost what it did the last time it came."
            count={moves.length + doubtful.length}
        >
            {moves.map(m => (
                <Row key={m.key}>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                        <p className="text-xs text-muted">
                            {m.pack ? `${m.pack}, ` : ''}code {m.code} &middot; {shortDate(m.on)}
                            {m.invoice ? `, ${m.invoice}` : ''}
                        </p>
                    </div>
                    <div className="min-w-0">
                        <Spark series={m.series} down={!m.up} />
                        <p className="text-xs text-muted tabular-nums mt-0.5">
                            {priceText(m.was, m.per)} to <b className="text-gray-900">{priceText(m.now, m.per)}</b> {m.per}
                        </p>
                    </div>
                    <Money change={m.change} effect={m.effect} under={m.split} />
                </Row>
            ))}
            {doubtful.map(m => (
                <div key={m.key} className="px-3 py-2.5 border-b border-border last:border-b-0 bg-amber-50/60">
                    <p className="text-sm text-gray-900">
                        <b>{m.name}</b> was left out: {priceText(m.was, m.per)} to {priceText(m.now, m.per)} {m.per}
                        {' '}on {shortDate(m.on)}{m.invoice ? `, ${m.invoice}` : ''}.
                    </p>
                    <p className="text-xs text-muted">
                        More likely a pack read wrong on one of the two than a real price. Worth checking the invoice.
                    </p>
                </div>
            ))}
        </Card>
    )
}

function Switches({ switches }) {
    return (
        <Card
            title="Bought as something else"
            sub="Against the one usually bought, per unit"
            empty="Everything came as the version recipes cost from."
            count={switches.length}
        >
            {switches.map(s => (
                <Row key={`${s.productId}:${s.code}`}>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                        <p className="text-xs text-muted">
                            {s.bought}, code {s.code} &middot; {shortDate(s.on)}{s.invoice ? `, ${s.invoice}` : ''}
                            {s.deliveries > 1 ? `, ${s.deliveries} deliveries` : ''}
                        </p>
                    </div>
                    {s.cannot ? (
                        <p className="text-xs text-muted">Cannot be compared. {WHY[s.why]}</p>
                    ) : (
                        <Bars
                            first={{ value: s.usualPer, label: s.usualFrom === 'delivery' ? 'usual' : 'recipes', fill: 'bg-sidebar' }}
                            second={{ value: s.per, label: 'this time', fill: 'bg-accent' }}
                            unit={s.unit}
                        />
                    )}
                    {s.cannot
                        ? <div className="sm:text-right"><Pill tone="grey">Cannot compare</Pill></div>
                        : <Money change={s.change} effect={s.effect} />}
                </Row>
            ))}
        </Card>
    )
}

function Recipes({ recipes, checkedOn, threshold }) {
    return (
        <Card
            title="Recipes not costing what we pay"
            sub={`Checked ${checkedOn ? shortDate(checkedOn) : 'today'}, more than ${threshold}% either way. On every report until it matches.`}
            empty={`Every recipe is within ${threshold}% of what was last paid for the version usually bought.`}
            count={recipes.length}
        >
            {recipes.map(r => (
                <Row key={r.productId}>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                        <p className="text-xs text-muted">
                            Last paid on {shortDate(r.paidOn)}{r.invoice ? `, ${r.invoice}` : ''}
                            {r.code ? `, code ${r.code}` : ''}
                        </p>
                    </div>
                    {r.state === 'cannot' ? (
                        <p className="text-xs text-muted">{WHY[r.why] || WHY.weight}</p>
                    ) : (
                        <Bars
                            first={{ value: r.recipe, label: 'recipes', fill: 'bg-gray-400' }}
                            second={{ value: r.paid, label: 'paid', fill: 'bg-amber-600' }}
                            unit={r.unit}
                        />
                    )}
                    {r.state === 'cannot' ? (
                        <div className="sm:text-right"><Pill tone="grey">Cannot compare</Pill></div>
                    ) : (
                        <div className="sm:text-right flex sm:block items-center gap-3">
                            <Pill tone="warn">{r.state === 'behind' ? 'Recipes behind' : 'Recipes too high'} {pct(r.gap)}</Pill>
                            <p className="text-sm font-bold tabular-nums text-gray-900 sm:mt-1">
                                {r.effect ? signed(r.effect) : 'Not bought'}
                            </p>
                            <p className="text-xs text-muted">this week</p>
                        </div>
                    )}
                </Row>
            ))}
        </Card>
    )
}

function Back({ back, reasons, owed, total, canEdit, jobs, busy, onPutOnList }) {
    const listed = back.length + owed.length
    return (
        <Card
            title="Came back, and why"
            sub={back.length
                ? `${back.length} credit ${back.length === 1 ? 'note' : 'notes'}, ${fmtMoney(total)}`
                : 'No credit notes this week'}
            empty="Nothing came back this week and nothing is owed."
            count={listed}
        >
            {reasons.length > 0 && (
                <div className="px-3 pt-3 pb-1">
                    <div className="flex h-3 rounded-md overflow-hidden gap-0.5" role="img" aria-label="What came back, by reason">
                        {reasons.map(r => (
                            <i
                                key={r.kind}
                                className="block h-full"
                                style={{ width: `${(100 * r.money) / (total || 1)}%`, background: r.colour }}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-700">
                        {reasons.map(r => (
                            <span key={r.kind} className="inline-flex items-center gap-1.5">
                                <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: r.colour }} />
                                {r.label} <b className="tabular-nums">{fmtMoney(r.money)}</b>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {back.map(b => (
                <Row key={b.id}>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{b.what}</p>
                        <p className="text-xs text-muted">
                            {b.number || 'Credit note'} of {shortDate(b.date)}
                            {b.against ? `, on ${b.against.number || 'an invoice'} of ${shortDate(b.against.date)}` : ''}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {b.parts.map(part => (
                            <span
                                key={part.kind}
                                className={`${badge} border bg-white text-gray-800`}
                                style={{ borderColor: part.colour }}
                            >
                                {part.label}{b.parts.length > 1 ? ` ${fmtMoney(part.money)}` : ''}
                            </span>
                        ))}
                        {b.given && <span className="text-xs text-muted self-center">given afterwards</span>}
                    </div>
                    <p className="text-sm font-bold tabular-nums text-green-700 sm:text-right">{fmtMoney(b.money)}</p>
                </Row>
            ))}

            {owed.length > 0 && (
                <>
                    <p className="px-3 py-2 bg-app-bg border-y border-border text-xs font-bold text-muted uppercase tracking-wider">
                        Still waiting on a credit
                    </p>
                    {owed.map(o => (
                        <Row key={o.id}>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">{o.what}</p>
                                <p className="text-xs text-muted">
                                    Since {shortDate(o.since)}{o.docket ? `, docket ${o.docket}` : ''}
                                </p>
                            </div>
                            <div>
                                <span className={`${badge} border bg-white text-gray-800`} style={{ borderColor: o.colour }}>
                                    {o.label}
                                </span>
                            </div>
                            <p className="text-sm font-bold tabular-nums text-gray-900 sm:text-right">
                                {o.money == null ? 'Not priced yet' : `${fmtMoney(o.money)} owed`}
                            </p>
                        </Row>
                    ))}
                    {canEdit && jobs && (jobs.add.length > 0 || jobs.tick.length > 0) && (
                        <div className="px-3 py-2.5 flex flex-wrap items-center gap-2 border-t border-border">
                            <button type="button" disabled={!!busy} onClick={() => onPutOnList(jobs)} className={rowButton('good')}>
                                {busy === 'list' ? 'Adding...' : 'Put these on the support list'}
                            </button>
                            {jobs.add.length > 0 && <Pill tone="warn">{jobs.add.length} to add</Pill>}
                            {jobs.tick.length > 0 && <Pill tone="down">{jobs.tick.length} to cross off</Pill>}
                        </div>
                    )}
                </>
            )}
        </Card>
    )
}

function NewCodes({ codes }) {
    if (!codes?.length) return null
    return (
        <details className="rounded-lg border border-border mt-4 group">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-gray-900 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                New to the Hub: {codes.length} {codes.length === 1 ? 'code' : 'codes'} delivered for the first time
            </summary>
            <ul className="px-3 pb-3 space-y-1">
                {codes.map(c => (
                    <li key={c.code} className="flex flex-wrap justify-between gap-x-3 text-sm">
                        <span className="text-gray-900">{c.name}</span>
                        <span className="text-xs text-muted">
                            code {c.code}, {shortDate(c.on)}{c.matched ? '' : ', not matched yet'}
                        </span>
                    </li>
                ))}
            </ul>
        </details>
    )
}

// ---------------------------------------------------------------------------
// Every line, for checking against the paper
// ---------------------------------------------------------------------------

function Ledger({ section }) {
    const groups = [
        ['Same product, new price', section.moves.map(m => ({
            key: m.key, name: m.name, what: `${m.pack || ''} code ${m.code}, ${shortDate(m.on)} ${m.invoice || ''}`,
            before: `${priceText(m.was, m.per)} ${m.per}`, now: priceText(m.now, m.per), change: pct(m.change), money: signed(m.effect),
        }))],
        ['Bought as something else', section.switches.map(s => ({
            key: `${s.productId}:${s.code}`, name: s.name, what: `${s.bought} instead, ${shortDate(s.on)} ${s.invoice || ''}`,
            before: s.usualPer == null ? '' : `${fmtMoney(s.usualPer)} ${s.unit}`, now: s.cannot ? 'cannot compare' : fmtMoney(s.per),
            change: pct(s.change), money: s.cannot ? '' : signed(s.effect),
        }))],
        ['Recipes not costing what we pay', section.recipes.map(r => ({
            key: r.productId, name: r.name, what: `last paid ${shortDate(r.paidOn)} ${r.invoice || ''}`,
            before: `${fmtMoney(r.recipe)} ${r.unit}`, now: r.state === 'cannot' ? 'cannot compare' : fmtMoney(r.paid),
            change: pct(r.gap), money: r.effect ? signed(r.effect) : '',
        }))],
        ['Came back', section.back.map(b => ({
            key: b.id, name: b.what, what: `${b.number || ''} of ${shortDate(b.date)}`,
            before: '', now: '', change: b.parts.map(p => p.label).join(', '), money: fmtMoney(b.money),
        }))],
        ['Still waiting on a credit', section.owed.map(o => ({
            key: o.id, name: o.what, what: `since ${shortDate(o.since)}`,
            before: '', now: '', change: o.label, money: o.money == null ? '' : fmtMoney(o.money),
        }))],
    ].filter(([, rows]) => rows.length)

    if (!groups.length) return null

    return (
        <details className="rounded-lg border border-border mt-4">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-gray-900 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                Every line this week
            </summary>
            <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full min-w-[720px] text-sm">
                    <thead>
                        <tr className={tableHeadRow}>
                            {['Product', 'What happened', 'Before', 'Now', 'Change', 'This week'].map((h, i) => (
                                <th key={h} className={`${tableHeadCell} px-3 py-2 ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map(([title, rows]) => (
                            <LedgerGroup key={title} title={title} rows={rows} />
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    )
}

function LedgerGroup({ title, rows }) {
    return (
        <>
            <tr>
                <td colSpan={6} className="px-3 py-2 bg-app-bg text-xs font-bold text-sidebar">{title}</td>
            </tr>
            {rows.map(r => (
                <tr key={r.key} className="border-b border-border align-top">
                    <td className="px-3 py-2 text-gray-900">{r.name}</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.what}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.before}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.now}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.change}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{r.money}</td>
                </tr>
            ))}
        </>
    )
}

// ---------------------------------------------------------------------------
// The two small drawings
// ---------------------------------------------------------------------------

// The price at each delivery, as steps. Grey dots for the ones before, the
// last one in the colour of which way it went.
function Spark({ series, down }) {
    if (!series?.length) return null
    const w = 200
    const h = 30
    const pad = 4
    const ys = series.map(p => p[1])
    const lo = Math.min(...ys)
    const hi = Math.max(...ys)
    const x = i => pad + (series.length === 1 ? 0 : (i * (w - pad * 2)) / (series.length - 1))
    const y = v => (hi === lo ? h / 2 : pad + ((hi - v) * (h - pad * 2)) / (hi - lo))
    const d = series.map((p, i) => (i === 0 ? `M${x(i)},${y(p[1])}` : `H${x(i)} V${y(p[1])}`)).join(' ')
    const last = series.length - 1

    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            className={`block w-full max-w-[200px] h-[30px] ${down ? 'text-green-700' : 'text-red-700'}`}
            role="img"
            aria-label="The price at each delivery"
        >
            <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
            {series.map((p, i) => (
                <circle
                    key={`${p[0]}-${i}`}
                    cx={x(i)}
                    cy={y(p[1])}
                    r={i === last ? 3.5 : 2}
                    fill={i === last ? 'currentColor' : '#9CA3AF'}
                />
            ))}
        </svg>
    )
}

// Two prices as two bars on one scale, so the gap is seen before it is read.
function Bars({ first, second, unit }) {
    const top = Math.max(first.value || 0, second.value || 0) || 1
    return (
        <div className="grid gap-1 text-xs">
            {[first, second].map(bar => (
                <div key={bar.label} className="flex items-center gap-2 min-w-0">
                    <span className="block w-24 flex-shrink-0">
                        <i className={`block h-2.5 rounded ${bar.fill}`} style={{ width: `${Math.max(4, (100 * (bar.value || 0)) / top)}%` }} />
                    </span>
                    <span className="text-gray-700 tabular-nums whitespace-nowrap">
                        {fmtMoney(bar.value)} {unit}, {bar.label}
                    </span>
                </div>
            ))}
        </div>
    )
}
