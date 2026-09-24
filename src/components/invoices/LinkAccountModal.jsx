import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass } from '@/lib/controlStyles'

// An account number the Hub has never seen, asked once and then never again.
//
// This is the guard on the worst failure in the whole feature. Suppliers are
// shared between the two restaurants, so the only thing on a document that says
// whose costs it belongs in is the account number printed at the top of it.
// Guessing would be silent, wrong in two weeks at once, and nearly impossible
// to find afterwards, so an unclaimed number stops the import and asks.
export default function LinkAccountModal({ accountNo, restaurantName, suppliers, onClose, onLink }) {
    const [supplierId, setSupplierId] = useState('')
    const [busy, setBusy] = useState(false)

    async function go() {
        setBusy(true)
        await onLink(supplierId)
        setBusy(false)
    }

    return (
        <Modal title="Whose account is this?" onClose={onClose} width="max-w-md">
            <div className="px-6 py-4">
                <p className="text-sm text-gray-900 mb-1">
                    Account <strong className="font-bold">{accountNo}</strong> is printed on this
                    document and nothing in the Hub says who it belongs to.
                </p>
                <p className="text-sm text-muted mb-4">
                    Answering this once is enough. Every document that supplier sends carries the
                    same number, and it is what puts a delivery on{' '}
                    {restaurantName || 'this restaurant'} rather than on the other one.
                </p>

                <label className={labelClass} htmlFor="link-account-supplier">Supplier</label>
                <select
                    id="link-account-supplier"
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    className={fieldClass}
                >
                    <option value="">Pick a supplier</option>
                    {(suppliers || []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                <p className={hintClass}>
                    The account goes against {restaurantName || 'the restaurant you are in'}, which
                    is where its invoices will land.
                </p>
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button
                    type="button"
                    disabled={!supplierId || busy}
                    onClick={go}
                    className={primaryButton('md', 'good')}
                >
                    {busy ? 'Linking...' : 'Link it'}
                </button>
            </div>
        </Modal>
    )
}
