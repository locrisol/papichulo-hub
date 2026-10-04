import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import AutoTextarea from '@/components/ui/AutoTextarea'
import { KINDS, sendProblem, suggestedName } from '@/lib/productRequests'
import { fmtMoney } from '@/lib/format'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass, errorBanner,
} from '@/lib/controlStyles'

// Sending something for review, instead of adding it to the brand's list.
//
// From Review, `row` is the invoice line, and the manager says what it is:
// something new, not stock, or a mistake. From Products there is no line, and
// it is always something new, with a supplier if they know one. Either way
// the owners get it on Products and by email, and answer it there.
export default function SendForReviewModal({ row = null, suppliers = [], onClose, onSend }) {
    const fromLine = !!row
    const [kind, setKind] = useState('new')
    const [name, setName] = useState(() => (fromLine ? suggestedName(row.line.description) : ''))
    const [reason, setReason] = useState('')
    const [supplierId, setSupplierId] = useState('')
    const [problem, setProblem] = useState('')
    const [busy, setBusy] = useState(false)

    async function go() {
        const wrong = sendProblem({ kind, name })
        if (wrong) { setProblem(wrong); return }
        setBusy(true)
        const failed = await onSend({ kind, name, reason, supplierId })
        setBusy(false)
        if (failed) setProblem(failed)
    }

    return (
        <Modal title={fromLine ? 'Send for review' : 'Request a product'} onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4 space-y-4">
                {problem && <p className={errorBanner} role="alert">{problem}</p>}

                {fromLine ? (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                        <dt className="text-xs text-muted pt-0.5">Supplier</dt>
                        <dd className="text-gray-900">{row.supplier?.name || 'Unknown supplier'}</dd>
                        <dt className="text-xs text-muted pt-0.5">Code</dt>
                        <dd className="text-gray-900 tabular-nums">{row.line.code}</dd>
                        <dt className="text-xs text-muted pt-0.5">On the invoice</dt>
                        <dd className="text-gray-900 break-words">{row.line.description}</dd>
                        <dt className="text-xs text-muted pt-0.5">Price</dt>
                        <dd className="text-gray-900 tabular-nums">{fmtMoney(row.line.price_per_case)} a case</dd>
                    </dl>
                ) : (
                    <p className="text-sm text-gray-700">
                        Products are added by the owners, for every restaurant. Say what you need and
                        they will add it, or tell you which one we already have.
                    </p>
                )}

                {fromLine && (
                    <div role="radiogroup" aria-labelledby="review-kind">
                        <p id="review-kind" className={labelClass}>What is it?</p>
                        <div className="space-y-2">
                            {KINDS.map(option => (
                                <label
                                    key={option.key}
                                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                                        kind === option.key
                                            ? 'border-accent bg-accent/5'
                                            : 'border-border hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="review-kind"
                                        value={option.key}
                                        checked={kind === option.key}
                                        onChange={() => { setKind(option.key); setProblem('') }}
                                        className="mt-0.5 accent-accent"
                                    />
                                    <span className="text-sm text-gray-900">{option.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {kind === 'new' && (
                    <div>
                        <label className={labelClass} htmlFor="review-name">What should it be called?</label>
                        <input
                            id="review-name"
                            value={name}
                            onChange={e => { setName(e.target.value); setProblem('') }}
                            className={fieldClass}
                        />
                    </div>
                )}

                {!fromLine && (
                    <div>
                        <label className={labelClass} htmlFor="review-supplier">Supplier, if you know one</label>
                        <select
                            id="review-supplier"
                            value={supplierId}
                            onChange={e => setSupplierId(e.target.value)}
                            className={fieldClass}
                        >
                            <option value="">Not sure</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                )}

                <div>
                    <label className={labelClass} htmlFor="review-reason">
                        {kind === 'new' ? 'Why do we need it?' : 'Anything the owners should know?'}
                    </label>
                    <AutoTextarea
                        id="review-reason"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        className={fieldClass}
                    />
                    <p className={hintClass}>Optional.</p>
                </div>
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button type="button" disabled={busy} onClick={go} className={primaryButton()}>
                    {busy ? 'Sending...' : 'Send for review'}
                </button>
            </div>
        </Modal>
    )
}
