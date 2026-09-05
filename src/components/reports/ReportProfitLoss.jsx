import { useState } from 'react'
import { fmtMoney } from '../../lib/format'
import { numberField } from '../../lib/numberInput'
import { wasChanged, platformShare, startsOpen } from '../../lib/weeklyReport'
import { secondaryButton } from '../../lib/controlStyles'

// The weekly profit and loss.
//
// Two kinds of line, and the difference between them is the whole design.
//
// The fixed overheads barely move. Rent is the same every week and typing it
// again every Monday is fifty chances a year to typo it, so each line carries
// what it was set to last week and sits locked. Opening one is a deliberate
// press, and a line that was opened and changed says so on the report, because
// an overhead that moved without explanation is the thing an owner will ask
// about.
//
// The exception is a line nothing carried into: the first report a restaurant
// writes, and any line added later. There is nothing for a lock to protect
// there, so it is open from the start and stays open while that week is being
// written.
//
// Third party delivery is the opposite. It changes every week and there is no
// rate that would hold, because promotions, penalties and goodwill credits all
// land in it. So it is typed, one euro figure per platform, and never locked.
//
// There is nowhere to type a delivery total. It is the platform lines added up,
// so it cannot say something the lines do not.

// A row that reads at any width. A table with four columns cannot do that, and
// two layouts for one list is two places to change.
function Row({ children, tint }) {
    return (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 px-3 border-b border-border last:border-b-0 ${tint || ''}`}>
            {children}
        </div>
    )
}

function pctText(v) {
    return v == null ? '—' : `${v.toFixed(1)}%`
}

// One standing cost. Locked until somebody opens it, unless it has never been
// set, in which case it is open from the start and stays open. On the first
// report every line is like that, and so is any line added afterwards.
function OverheadLine({ item, net, canEdit, onSave }) {
    const never = startsOpen(item)
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState(String(item.amount ?? ''))

    const editing = canEdit && (never || open)

    const amount = Number(item.amount) || 0
    const share = net > 0 ? (amount / net) * 100 : null
    const changed = wasChanged(item)

    async function commit() {
        // A line that has never been set stays open. Locking it the moment the
        // first figure is typed would mean pressing Open again to fix a typo,
        // which is the opposite of what the first report needs.
        if (!never) setOpen(false)
        const next = draft === '' ? 0 : Number(draft)
        if (Math.abs(next - amount) < 0.005) return
        await onSave(item.id, next)
    }

    return (
        <Row tint={changed ? 'bg-accent-light/40' : ''}>
            <span className="flex-1 min-w-[8rem] text-sm text-gray-800">{item.label}</span>

            {editing ? (
                <input
                    {...numberField({ value: draft, onChange: setDraft })}
                    autoFocus={open}
                    placeholder="0.00"
                    onBlur={commit}
                    onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') { setDraft(String(item.amount ?? '')); setOpen(false) }
                    }}
                    className="w-28 text-right bg-white border border-accent rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
                />
            ) : (
                <span className="w-28 text-right text-sm tabular-nums font-semibold text-gray-900">
                    {fmtMoney(amount)}
                </span>
            )}

            <span className="w-14 text-right text-xs tabular-nums text-muted">{pctText(share)}</span>

            {canEdit && !editing && (
                <button
                    onClick={() => { setDraft(String(item.amount ?? '')); setOpen(true) }}
                    className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-accent-ink transition-colors"
                    aria-label={`Open ${item.label} to change it`}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-3.5 h-3.5">
                        <rect x="4" y="10" width="16" height="11" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                    Open
                </button>
            )}

            {changed && (
                <span className="basis-full text-xs text-accent-ink">
                    Changed this week, was {fmtMoney(item.carried_from)}. The report will say so.
                </span>
            )}
        </Row>
    )
}

// What one platform charged this week, and what share of its own takings that
// was. The takings come from the Hub; only the cost is typed.
function DeliveryLine({ platform, taken, item, canEdit, onSave }) {
    const [draft, setDraft] = useState(String(item?.amount ?? ''))
    const cost = Number(item?.amount) || 0
    const share = platformShare(cost, taken)

    async function commit() {
        const next = draft === '' ? 0 : Number(draft)
        if (Math.abs(next - cost) < 0.005) return
        await onSave(platform, next)
    }

    return (
        <Row>
            <span className="flex-1 min-w-[7rem] text-sm text-gray-800">{platform.name}</span>

            <span className="text-xs tabular-nums text-muted whitespace-nowrap">
                {fmtMoney(taken)} taken
            </span>

            {canEdit ? (
                <input
                    {...numberField({ value: draft, onChange: setDraft })}
                    onBlur={commit}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="0.00"
                    className="w-24 text-right bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                />
            ) : (
                <span className="w-24 text-right text-sm tabular-nums font-semibold text-gray-900">
                    {fmtMoney(cost)}
                </span>
            )}

            <span className={`w-14 text-right text-sm tabular-nums font-bold ${share == null ? 'text-gray-400' : 'text-gray-900'}`}>
                {pctText(share)}
            </span>
        </Row>
    )
}

export default function ReportProfitLoss({
    section, figures, platforms, taken, canEdit,
    onSaveOverhead, onSaveDelivery, onAddOverhead,
}) {
    const [adding, setAdding] = useState(false)
    const [name, setName] = useState('')

    const overheads = section.items.filter(i => i.kind === 'overhead')
    // The first report a restaurant writes: nothing carried into any line, so
    // there is nothing for a lock to protect.
    const firstTime = overheads.length > 0 && overheads.every(startsOpen)
    const delivery = section.items.filter(i => i.kind === 'delivery')
    const byKey = new Map(delivery.map(d => [d.key, d]))

    const net = figures.net

    return (
        <div>
            {/* DELIVERY */}
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                Third party delivery
            </p>
            <p className="text-xs text-muted mb-2">
                A euro figure each week, not a rate, because promotions and penalties move it. There is nowhere
                to type a total.
            </p>

            <div className="rounded-lg border border-border bg-white overflow-hidden">
                {platforms.map(p => (
                    <DeliveryLine
                        key={p.id}
                        platform={p}
                        taken={taken[p.id] || 0}
                        item={byKey.get(p.id)}
                        canEdit={canEdit}
                        onSave={onSaveDelivery}
                    />
                ))}

                {platforms.length === 0 && (
                    <p className="px-3 py-3 text-sm text-muted">
                        No online platforms are set up for this restaurant yet.
                    </p>
                )}

                <Row tint="bg-app-bg font-semibold">
                    <span className="flex-1 min-w-[7rem] text-sm text-gray-900">Total</span>
                    <span className="text-sm tabular-nums text-gray-900">{fmtMoney(figures.deliveryTotal)}</span>
                    <span className="w-14 text-right text-xs tabular-nums text-muted">
                        {pctText(net > 0 ? (figures.deliveryTotal / net) * 100 : null)}
                    </span>
                </Row>
            </div>

            {/* OVERHEADS */}
            <p className="text-xs font-bold text-muted uppercase tracking-wider mt-6 mb-1">
                Fixed overhead
            </p>
            <p className="text-xs text-muted mb-2">
                {firstTime
                    ? 'Nothing has been set for this restaurant yet, so every line is open. Fill in what you know and leave the rest at nothing. From next week they carry and lock.'
                    : 'Locked at what each was last week. Open one to change it, and it carries forward from then on.'}
            </p>

            <div className="rounded-lg border border-border bg-white overflow-hidden">
                {overheads.map(item => (
                    <OverheadLine
                        key={item.id}
                        item={item}
                        net={net}
                        canEdit={canEdit}
                        onSave={onSaveOverhead}
                    />
                ))}

                <Row tint="bg-app-bg font-semibold">
                    <span className="flex-1 min-w-[8rem] text-sm text-gray-900">
                        Total fixed overhead
                    </span>
                    <span className="w-28 text-right text-sm tabular-nums text-gray-900">
                        {fmtMoney(figures.overhead)}
                    </span>
                    <span className="w-14 text-right text-xs tabular-nums text-muted">
                        {pctText(figures.overheadPct)}
                    </span>
                </Row>
            </div>

            {canEdit && (
                <div className="mt-2">
                    {adding ? (
                        <div className="flex flex-wrap gap-2">
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                                placeholder="What is it called"
                                className="flex-1 min-w-[10rem] bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                            />
                            <button
                                onClick={async () => {
                                    if (!name.trim()) return
                                    await onAddOverhead(name.trim())
                                    setName('')
                                    setAdding(false)
                                }}
                                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-accent-ink transition-colors"
                            >
                                Add
                            </button>
                            <button onClick={() => { setName(''); setAdding(false) }} className={secondaryButton}>
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setAdding(true)}
                            className="text-sm font-semibold text-accent-ink hover:underline"
                        >
                            + Add a line
                        </button>
                    )}
                </div>
            )}

            {/* WHAT IS LEFT */}
            <div className="mt-6 rounded-lg border border-border bg-white overflow-hidden">
                <Row>
                    <span className="flex-1 min-w-[8rem] text-sm text-gray-700">Gross margin</span>
                    <span className="w-28 text-right text-sm tabular-nums text-gray-900">{fmtMoney(figures.grossMargin)}</span>
                    <span className="w-14 text-right text-xs tabular-nums text-muted">{pctText(figures.grossMarginPct)}</span>
                </Row>
                <Row>
                    <span className="flex-1 min-w-[8rem] text-sm text-gray-700">Gross profit, after wages</span>
                    <span className="w-28 text-right text-sm tabular-nums text-gray-900">{fmtMoney(figures.grossProfit)}</span>
                    <span className="w-14 text-right text-xs tabular-nums text-muted">{pctText(figures.grossProfitPct)}</span>
                </Row>
            </div>

            <div className="mt-3 rounded-lg bg-sidebar text-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider opacity-75 mb-1">Net earnings</p>
                <p className="font-serif text-3xl font-bold leading-none tabular-nums">
                    {fmtMoney(figures.earnings)}
                </p>
                <p className="text-sm mt-2 tabular-nums opacity-85">
                    {pctText(figures.earningsPct)} of net sales
                    <span className="opacity-70"> &middot; {pctText(figures.earningsPctGross)} of gross</span>
                </p>
            </div>

            <p className="text-xs text-muted mt-2">
                Both are shown because the mail has always quoted the gross figure while every other percentage
                on the report is against net. Say which one you want as the headline and the other can go.
            </p>
        </div>
    )
}
