import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { fmtMoney } from '@/lib/format'
import { fullDate } from '@/lib/dates'
import { fillInPlan } from '@/lib/invoiceImport'
import {
    modalFooter, secondaryButton, primaryButton, captionClass, hintClass,
} from '@/lib/controlStyles'

// Putting the detail behind an invoice somebody typed off a total.
//
// **A hand entered total is net and a document is gross.** He takes a shortage
// off before typing it in, which is why matching one to the other on the total
// would miss exactly the invoices that most need filling in, and why simply
// replacing the figure would move the food cost of a week that was reported
// months ago.
//
// So the total goes up to what the supplier actually charged and the difference
// becomes a claim of the same amount. The week lands on the figure it has
// always been on, and what was an unexplained lower number becomes a tracked
// shortage with a document behind it.
export default function FillInModal({ doc, invoice, lines, onClose, onFillIn }) {
    const plan = fillInPlan(doc, invoice)
    const [busy, setBusy] = useState(false)

    async function go() {
        setBusy(true)
        await onFillIn(plan)
        setBusy(false)
    }

    return (
        <Modal title="Fill in what is behind it" onClose={onClose} width="max-w-lg">
            <div className="px-6 py-4">
                <p className={captionClass}>Already in the Hub</p>
                <p className="text-sm text-gray-900 mt-1 mb-4">
                    {fmtMoney(invoice.total_amount)} on {fullDate(invoice.invoice_date)}, typed in
                    off a total with nothing behind it.
                    {invoice.notes ? ` "${invoice.notes}"` : ''}
                </p>

                <p className={captionClass}>On the document</p>
                <p className="text-sm text-gray-900 mt-1 mb-4">
                    {doc.number}, {fmtMoney(doc.goodsTotal)}, {lines} lines.
                </p>

                {plan.same && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800">
                        The two agree to the cent. The lines go on and nothing about the week moves.
                    </div>
                )}

                {plan.deducted > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-900">
                        <p className="font-bold">
                            {fmtMoney(plan.deducted)} was taken off before it was typed in.
                        </p>
                        <p className="mt-1">
                            The invoice goes up to {fmtMoney(plan.gross)}, which is what they
                            charged, and that {fmtMoney(plan.deducted)} becomes a claim against this
                            delivery. The week stays on {fmtMoney(plan.net)}, exactly where it is
                            now.
                        </p>
                        <p className="mt-1">
                            The claim starts open, because nobody knows whether the credit ever
                            came. It goes on the list until somebody says.
                        </p>
                    </div>
                )}

                {plan.over > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900">
                        <p className="font-bold">
                            {fmtMoney(plan.over)} more was typed in than the document says.
                        </p>
                        <p className="mt-1">
                            That is not a shortage, so nothing is claimed for it. The invoice goes
                            down to {fmtMoney(plan.gross)} and the week drops by {fmtMoney(plan.over)}.
                            It is worth knowing why before you press this: either the typing was
                            wrong, or this is not the same delivery.
                        </p>
                    </div>
                )}

                <p className={hintClass}>
                    Who entered it and when is kept. Nothing about the invoice is deleted and
                    started again.
                </p>
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={go}
                    className={primaryButton('md', plan.over > 0 ? 'accent' : 'good')}
                >
                    {busy ? 'Filling in...' : 'Fill it in'}
                </button>
            </div>
        </Modal>
    )
}
