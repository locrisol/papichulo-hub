import { useState } from 'react'
import { addExtra, removeExtra, recipientSummary } from '../../lib/reportRecipients'
import { card, secondaryButton, removeButton } from '../../lib/controlStyles'
import AddButton from '../AddButton'

// Who the report goes to.
//
// Two lists drawn differently on purpose, because they behave differently.
//
// The owners are worked out from the accounts every week and cannot be taken
// off. A list that has to be maintained is a list that is wrong by March, and
// the worst thing this mail can do is not reach the person who owns the place.
// They are shown by name rather than by address: the address lives with the
// login, which the browser cannot read and has no business reading, and a name
// is what somebody actually recognises anyway.
//
// The extras are typed and stay typed. The accountant, another manager,
// somebody covering for a month. They belong to the restaurant rather than to
// this week, so the same people get next week's without anybody retyping them,
// and removing one removes them from then on.
export default function Recipients({ owners = [], extras = [], canEdit, onChange, busy }) {
    const [open, setOpen] = useState(false)
    const [typed, setTyped] = useState('')
    const [problem, setProblem] = useState('')

    function add() {
        const { list, error } = addExtra(extras, typed)
        setProblem(error || '')
        if (error) return
        if (list !== extras) onChange(list)
        setTyped('')
    }

    return (
        <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <p className="text-xs font-bold text-muted uppercase tracking-wider">Who gets it</p>
                <p className="text-xs text-muted">{recipientSummary({ owners, extras })}</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {owners.map(owner => (
                    <span
                        key={owner.id}
                        className="inline-flex items-center gap-1.5 min-h-[2.25rem] px-3 rounded-lg
                            bg-cream border border-border text-sm text-sidebar"
                    >
                        {owner.full_name}
                        <span className="text-xs text-muted">owner</span>
                    </span>
                ))}

                {extras.map(address => (
                    <span
                        key={address}
                        className="inline-flex items-center gap-1 min-h-[2.25rem] pl-3 pr-1 rounded-lg
                            bg-white border border-border text-sm text-sidebar"
                    >
                        <span className="truncate max-w-[14rem]">{address}</span>
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => onChange(removeExtra(extras, address))}
                                disabled={busy}
                                aria-label={`Take ${address} off the list`}
                                className={removeButton}
                            >
                                ×
                            </button>
                        )}
                    </span>
                ))}
            </div>

            {owners.length === 0 && (
                <p className="text-xs text-muted mt-3">
                    Nobody here has an owner account, so the report will only go to the addresses
                    added below.
                </p>
            )}

            {canEdit && (open ? (
                <div className="mt-3">
                    {/* type=email so a phone gives the keyboard with the @ on it */}
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="email"
                            inputMode="email"
                            autoComplete="off"
                            value={typed}
                            onChange={e => { setTyped(e.target.value); setProblem('') }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); add() }
                                if (e.key === 'Escape') { setTyped(''); setProblem(''); setOpen(false) }
                            }}
                            placeholder="accounts@somewhere.ie"
                            autoFocus
                            className="flex-1 min-w-[12rem] min-h-[2.5rem] px-3 rounded-lg border border-border
                                text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                        />
                        <button type="button" onClick={add} disabled={busy} className={secondaryButton}>
                            Add
                        </button>
                    </div>
                    {problem && <p className="text-xs text-accent-ink mt-2">{problem}</p>}
                    <p className="text-xs text-muted mt-2">
                        Any address works. They do not need a Hub account, and whoever is added stays
                        on every week from now until they are taken off.
                    </p>
                </div>
            ) : (
                <div className="mt-3">
                    <AddButton onClick={() => setOpen(true)}>Add somebody else</AddButton>
                </div>
            ))}
        </div>
    )
}
