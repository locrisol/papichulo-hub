import { useState } from 'react'
import { fmtMoney } from '../../lib/format'
import { numberField } from '../../lib/numberInput'
import { wasChanged, platformShare, startsOpen, figureGaps } from '../../lib/weeklyReport'
import { removeButton, secondaryButton } from '../../lib/controlStyles'
import { useConfirm } from '../../context/ConfirmContext'
import AddButton from '../AddButton'

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
//
// Still to come: a chart per platform on the delivery costs, so what each one
// keeps can be watched week to week rather than read one week at a time. Forty
// three percent is only alarming once you can see it was thirty eight in May.

// Every line in this section is the same shape: something on the left naming
// it, figures and controls on the right, and occasionally a sentence
// underneath. The two halves stack on a phone and sit on one line from sm up.
//
// This used to be a single wrapping flex row, which is not a layout, it is a
// hope. Whether a row broke depended on how long the platform happened to be
// called and how wide its figure was, so Deliveroo and Uber Eats wrapped
// differently in the same list: the percentage ended up under the name on one
// and beside the box on the other. Two blocks that stack cannot do that.
function Row({ left, right, extra, tint }) {
    return (
        <div className={`py-2.5 px-3 border-b border-border last:border-b-0 ${tint || ''}`}>
            <div className="sm:flex sm:items-center sm:gap-3">
                <div className="flex items-center gap-2 min-w-0 sm:flex-1">{left}</div>
                <div className="flex items-center justify-end gap-3 mt-2 sm:mt-0">{right}</div>
            </div>
            {extra && <div className="mt-1.5">{extra}</div>}
        </div>
    )
}

function pctText(v) {
    return v == null ? '—' : `${v.toFixed(1)}%`
}

// The money box on a row. Stretches on a phone, where nothing else is competing
// for the line and a box you have to aim at is a box you mistype into. Natural
// width above that.
const moneyBox = 'flex-1 sm:flex-none sm:w-28 text-right rounded-lg px-2 py-1.5 text-sm tabular-nums '
    + 'focus:outline-none focus:ring-2 focus:ring-accent'

// One standing cost. Locked until somebody opens it, unless it has never been
// set, in which case it is open from the start and stays open. On the first
// report every line is like that, and so is any line added afterwards.
function OverheadLine({ item, net, canEdit, onSave, onRename, onRemove }) {
    const confirm = useConfirm()
    const never = startsOpen(item)
    const [open, setOpen] = useState(false)
    const [renaming, setRenaming] = useState(false)
    const [draft, setDraft] = useState(String(item.amount ?? ''))
    const [label, setLabel] = useState(item.label || '')

    const editing = canEdit && (never || open)

    const amount = Number(item.amount) || 0
    const share = net > 0 ? (amount / net) * 100 : null
    const changed = wasChanged(item)

    // Every overhead line can be renamed and dropped. The list the Hub offers
    // on a first report is a starting point, not a rule: a restaurant with no
    // equipment lease should not carry an empty line for it every week, and one
    // paying an alarm company should be able to say so.
    async function drop() {
        const ok = await confirm({
            title: `Remove ${item.label}?`,
            message: 'It goes from this week and stops carrying into the weeks after. Reports already sent '
                + 'keep their own copy and do not change.',
            confirmLabel: 'Remove it',
        })
        if (ok) onRemove(item.id)
    }

    async function commitLabel() {
        setRenaming(false)
        const next = label.trim()
        if (!next || next === item.label) { setLabel(item.label || ''); return }
        await onRename(item.id, next)
    }

    async function commit() {
        // A line that has never been set stays open. Locking it the moment the
        // first figure is typed would mean pressing Open again to fix a typo,
        // which is the opposite of what the first report needs.
        if (!never) setOpen(false)
        const next = draft === '' ? 0 : Number(draft)
        if (Math.abs(next - amount) < 0.005) return
        await onSave(item.id, next)
    }

    const left = renaming ? (
        <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { setLabel(item.label || ''); setRenaming(false) }
            }}
            autoFocus
            aria-label="What this line is called"
            className="flex-1 min-w-0 bg-white border border-accent rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
    ) : canEdit ? (
        <button
            onClick={() => { setLabel(item.label || ''); setRenaming(true) }}
            title="Rename this line"
            className="flex-1 min-w-0 text-left text-sm text-gray-800 hover:text-accent-ink transition-colors"
        >
            {item.label}
        </button>
    ) : (
        <span className="flex-1 min-w-0 text-sm text-gray-800">{item.label}</span>
    )

    const right = (
        <>
            {editing ? (
                <input
                    {...numberField({ value: draft, onChange: setDraft, decimals: 2 })}
                    autoFocus={open}
                    placeholder="0.00"
                    onBlur={commit}
                    onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') { setDraft(String(item.amount ?? '')); setOpen(false) }
                    }}
                    aria-label={item.label}
                    className={`${moneyBox} bg-white border border-accent`}
                />
            ) : (
                // The same box, disabled and greyed, rather than the figure as
                // loose text. A field that turns into a line of writing when it
                // is locked reads as a different thing from the one you typed
                // into, and the eye has to find the column again every time one
                // is opened and shut.
                <input
                    type="text"
                    value={fmtMoney(amount)}
                    disabled
                    readOnly
                    aria-label={item.label}
                    className={`${moneyBox} bg-app-bg border border-border text-muted
                        font-semibold cursor-not-allowed`}
                />
            )}

            <span className="w-12 text-right text-xs tabular-nums text-muted">{pctText(share)}</span>

            {canEdit && !editing && (
                <button
                    onClick={() => { setDraft(String(item.amount ?? '')); setOpen(true) }}
                    className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-accent-ink transition-colors"
                    aria-label={`Edit ${item.label}`}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="w-3.5 h-3.5">
                        <rect x="4" y="10" width="16" height="11" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                    Edit
                </button>
            )}

            {canEdit && (
                <button
                    onClick={drop}
                    aria-label={`Remove ${item.label}`}
                    className={removeButton}
                >
                    &times;
                </button>
            )}
        </>
    )

    return (
        <Row
            tint={changed ? 'bg-accent-light/40' : ''}
            left={left}
            right={right}
            extra={changed && (
                <span className="text-xs text-accent-ink">
                    Changed this week, was {fmtMoney(item.carried_from)}. The report will say so.
                </span>
            )}
        />
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
        <Row
            left={
                <>
                    <span className="flex-1 min-w-0 text-sm text-gray-800">{platform.name}</span>
                    <span className="text-xs tabular-nums text-muted whitespace-nowrap">
                        {fmtMoney(taken)} taken
                    </span>
                </>
            }
            right={
                <>
                    {canEdit ? (
                        <input
                            {...numberField({ value: draft, onChange: setDraft, decimals: 2 })}
                            onBlur={commit}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            placeholder="0.00"
                            aria-label={`What ${platform.name} cost this week`}
                            className={`${moneyBox} sm:w-24 bg-white border border-gray-300 shadow-sm focus:border-accent`}
                        />
                    ) : (
                        <span className="flex-1 sm:flex-none sm:w-24 text-right text-sm tabular-nums font-semibold text-gray-900">
                            {fmtMoney(cost)}
                        </span>
                    )}
                    <span className={`w-14 text-right text-sm tabular-nums font-bold ${
                        share == null ? 'text-gray-400' : 'text-gray-900'}`}>
                        {pctText(share)}
                    </span>
                </>
            }
        />
    )
}

// A plain line of figures: a name, an amount, a share. The totals and the run
// down to what was left.
function FigureRow({ label, hint, amount, share, tint, strong }) {
    return (
        <Row
            tint={tint}
            left={
                <span className={`flex-1 min-w-0 text-sm ${strong ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {label}
                    {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
                </span>
            }
            right={
                <>
                    <span className={`text-sm tabular-nums text-gray-900 ${strong ? 'font-semibold' : ''}`}>
                        {fmtMoney(amount)}
                    </span>
                    <span className="w-12 text-right text-xs tabular-nums text-muted">
                        {share == null ? '' : pctText(share)}
                    </span>
                </>
            }
        />
    )
}

export default function ReportProfitLoss({
    section, figures, platforms, taken, canEdit,
    onSaveOverhead, onSaveDelivery, onAddOverhead, onRenameOverhead, onRemoveOverhead,
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
    const gaps = figureGaps(figures)

    return (
        <div>
            {/* DELIVERY */}
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                Third party delivery costs
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

                <FigureRow
                    strong
                    tint="bg-app-bg"
                    label="Total"
                    amount={figures.deliveryTotal}
                    share={net > 0 ? (figures.deliveryTotal / net) * 100 : null}
                />
            </div>

            {/* OVERHEADS */}
            <p className="text-xs font-bold text-muted uppercase tracking-wider mt-6 mb-1">
                Fixed overhead
            </p>
            <p className="text-xs text-muted mb-2">
                {firstTime
                    ? 'Nothing has been set for this restaurant yet, so every line is open. Fill in what you know, and remove any that will never apply. From next week they carry and lock.'
                    : 'Locked at what each was last week. Edit one to change it, and it carries forward from then on. Press a name to rename it.'}
            </p>

            <div className="rounded-lg border border-border bg-white overflow-hidden">
                {overheads.map(item => (
                    <OverheadLine
                        key={item.id}
                        item={item}
                        net={net}
                        canEdit={canEdit}
                        onSave={onSaveOverhead}
                        onRename={onRenameOverhead}
                        onRemove={onRemoveOverhead}
                    />
                ))}

                <FigureRow
                    strong
                    tint="bg-app-bg"
                    label="Total fixed overhead"
                    amount={figures.overhead}
                    share={figures.overheadPct}
                />
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
                        <AddButton onClick={() => setAdding(true)}>Add a line</AddButton>
                    )}
                </div>
            )}

            {/* WHAT IS LEFT */}
            <p className="text-xs font-bold text-muted uppercase tracking-wider mt-6 mb-2">
                What is left
            </p>

            <div className="rounded-lg border border-border bg-white overflow-hidden">
                <FigureRow label="Net sales" amount={figures.net} share={null} />
                <FigureRow
                    label="Total cost of sales"
                    hint="food, packaging and wages"
                    amount={figures.costOfSales}
                    share={figures.costOfSalesPct}
                />
                <FigureRow
                    strong
                    tint="bg-app-bg"
                    label="Gross profit"
                    amount={figures.grossProfit}
                    share={figures.grossProfitPct}
                />
                <FigureRow
                    label="Less total fixed overhead"
                    amount={figures.overhead}
                    share={figures.overheadPct}
                />
            </div>

            <div className="mt-3 rounded-lg bg-sidebar text-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider opacity-75 mb-1">Net earnings</p>
                <p className="font-serif text-3xl font-bold leading-none tabular-nums">
                    {fmtMoney(figures.earnings)}
                </p>
                <p className="text-sm mt-2 tabular-nums opacity-85">
                    {pctText(figures.earningsPct)} of net sales
                </p>
            </div>

            {/* Against net, like every other percentage on the report.
                The old spreadsheet printed this one line against gross while
                working everything above it out against net, so a week reading
                13.6% there reads 14.8% here. Nothing about the week changed:
                the two rows had simply been measuring against different
                things, and one denominator throughout is the only way the
                report adds up when read down the page. */}

            {gaps.length > 0 && (
                <div className="mt-4 rounded-lg border border-accent/50 bg-accent-light/50 p-4">
                    <p className="text-sm font-bold text-accent-ink mb-1">
                        These figures are not finished
                    </p>
                    <ul className="text-sm text-accent-ink space-y-1 list-disc pl-5">
                        {gaps.map(gap => <li key={gap}>{gap}</li>)}
                    </ul>
                    <p className="text-xs text-accent-ink/80 mt-2">
                        The arithmetic above is right; what it is being given is not. Enter the missing hours and
                        invoices and this section fills itself in.
                    </p>
                </div>
            )}
        </div>
    )
}
