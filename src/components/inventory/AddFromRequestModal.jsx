import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { numberField } from '@/lib/numberInput'
import { fmtMoney, fmtUnitCost, num } from '@/lib/format'
import { FOOD_SECTIONS } from '@/lib/stockTakeSummary'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass, errorBanner,
    checkbox, checkRow,
} from '@/lib/controlStyles'

const SECTIONS = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']
const UNITS = ['KG', 'Units', 'Litre']

// Adding something sent for review to the brand's list.
//
// Only what the brand's list needs, and what the invoice line cannot say:
// the name, where it is kept, what it is counted in and how many of those
// are in a case. The price comes off the line. Allergens come next, on the
// Allergens page, because a dish with it in says Ask a member of staff
// until they are set.
export default function AddFromRequestModal({ request, onClose, onAdd }) {
    const onLine = !!request.supplier_code
    const [name, setName] = useState(request.name || '')
    const [section, setSection] = useState('Dry')
    const [unit, setUnit] = useState('Units')
    const [perPack, setPerPack] = useState(request.units_per_case != null ? String(num(request.units_per_case)) : '')
    const [recommend, setRecommend] = useState(true)
    const [problem, setProblem] = useState('')
    const [busy, setBusy] = useState(false)

    const units = num(perPack)
    const perUnit = units > 0 ? num(request.price_per_case) / units : null
    const food = FOOD_SECTIONS.includes(section)

    async function go() {
        if (!name.trim()) { setProblem('Give it a name.'); return }
        if (onLine && !(units > 0)) { setProblem(`Say how many ${unitWord(unit)} are in a case.`); return }
        setBusy(true)
        const failed = await onAdd({ name, section, unit, unitsPerCase: onLine ? units : null, recommend, food })
        setBusy(false)
        if (failed) setProblem(failed)
    }

    return (
        <Modal title={`Add ${request.name || request.description || 'it'}`} onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4 space-y-4">
                {problem && <p className={errorBanner} role="alert">{problem}</p>}

                {onLine && (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                        <dt className="text-xs text-muted pt-0.5">Supplier</dt>
                        <dd className="text-gray-900">{request.suppliers?.name || 'Unknown supplier'}</dd>
                        <dt className="text-xs text-muted pt-0.5">Code</dt>
                        <dd className="text-gray-900 tabular-nums">{request.supplier_code}</dd>
                        <dt className="text-xs text-muted pt-0.5">On the invoice</dt>
                        <dd className="text-gray-900 break-words">{request.description}</dd>
                        <dt className="text-xs text-muted pt-0.5">Price</dt>
                        <dd className="text-gray-900 tabular-nums">{fmtMoney(request.price_per_case)} a case</dd>
                    </dl>
                )}

                <div>
                    <label className={labelClass} htmlFor="add-name">Name on the brand&apos;s list</label>
                    <input
                        id="add-name"
                        value={name}
                        onChange={e => { setName(e.target.value); setProblem('') }}
                        className={fieldClass}
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className={labelClass} htmlFor="add-section">Kept in</label>
                        <select id="add-section" value={section} onChange={e => setSection(e.target.value)} className={fieldClass}>
                            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass} htmlFor="add-unit">Counted in</label>
                        <select id="add-unit" value={unit} onChange={e => setUnit(e.target.value)} className={fieldClass}>
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                </div>

                {onLine && (
                    <div>
                        <label className={labelClass} htmlFor="add-units">How many {unitWord(unit)} in a case</label>
                        <input
                            id="add-units"
                            {...numberField({ value: perPack, onChange: v => { setPerPack(v); setProblem('') }, decimals: 3 })}
                            className={fieldClass}
                        />
                        <p className={hintClass}>
                            {request.pack_size ? `The invoice says ${request.pack_size}.` : 'The invoice does not say.'}
                            {perUnit != null && <> That makes it {fmtUnitCost(perUnit)} a {unitWord(unit, 1)}.</>}
                        </p>
                    </div>
                )}

                {onLine && (
                    <label className={checkRow}>
                        <input
                            type="checkbox"
                            checked={recommend}
                            onChange={e => setRecommend(e.target.checked)}
                            className={checkbox}
                        />
                        <span className="text-sm text-gray-900">Recommend this version</span>
                    </label>
                )}

                {food && (
                    <p className={hintClass}>
                        Its allergens come next. Until they are set, a dish with it in says Ask a member of staff.
                    </p>
                )}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Back</button>
                <button type="button" disabled={busy} onClick={go} className={primaryButton('md', 'good')}>
                    {busy ? 'Adding...' : food ? 'Add it and set allergens' : 'Add it'}
                </button>
            </div>
        </Modal>
    )
}

// The unit as a word in a sentence: kilos, units, litres.
function unitWord(unit, count = 2) {
    if (unit === 'KG') return count === 1 ? 'kilo' : 'kilos'
    if (unit === 'Litre') return count === 1 ? 'litre' : 'litres'
    return count === 1 ? 'unit' : 'units'
}
