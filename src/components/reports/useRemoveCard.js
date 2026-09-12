import { useConfirm } from '../../context/ConfirmContext'

// Removing a card off a report, asked for first.
//
// Every delete in this app goes through the same dialog rather than the
// browser's own box, and the report is no exception. What is different here is
// how many small cards there are: a comment, a review, a refund, a task. Asking
// about every one of them, including one somebody added by mistake two seconds
// ago and never typed into, is the kind of friction that teaches people to
// dismiss dialogs without reading them.
//
// So it asks when there is something to lose, and does it quietly when there is
// not. An empty card holds nothing, and removing nothing needs no ceremony.
export function useRemoveCard() {
    const confirm = useConfirm()

    // `what` names the thing, `holds` is whatever it would take with it.
    return async function removeCard({ what, holds, onRemove }) {
        const empty = holds == null || String(holds).trim() === ''
        if (empty) return onRemove()

        const ok = await confirm({
            title: `Remove this ${what}?`,
            message: `"${String(holds).trim().slice(0, 140)}" goes with it, and it cannot be brought back.`,
            confirmLabel: 'Remove it',
        })
        if (ok) return onRemove()
    }
}
