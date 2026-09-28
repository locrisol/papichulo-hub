import Modal from '@/components/ui/Modal'
import { fullDate } from '@/lib/dates'
import { dayName } from '@/lib/events'
import { badge, modalFooter, secondaryButton, primaryButton } from '@/lib/controlStyles'
import { kindTag, kindLabel, scopeLabel, timeLabel, labelsOf, runsMoreThanADay } from '@/lib/diary'

// One diary entry, opened from wherever it is drawn.
//
// Pressing a thing used to do two different jobs depending on which thing it
// was. An Arena listing opened and told you about itself. A delivery told you
// nothing. A catering job dropped you straight into a form with a Save button,
// which is a strange thing to be handed when all you did was press a chip to
// find out what it was.
//
// So everything opens to be read, and editing is a thing you ask for. That also
// means an employee gets a real answer where before they got a chip that did
// nothing at all, since they cannot edit.
export default function DiaryEntryModal({ entry, restaurants, canEdit, onEdit, onClose }) {
    if (!entry) return null

    const when = runsMoreThanADay(entry)
        ? `${fullDate(entry.starts_on)} to ${fullDate(entry.ends_on)}`
        : `${dayName(entry.starts_on)} ${fullDate(entry.starts_on)}`

    const rows = [
        { label: 'When', value: when },
        { label: 'Time', value: timeLabel(entry) },
        { label: 'Goes on', value: scopeLabel(entry, restaurants) },
    ]

    if (entry.location) rows.push({ label: 'Where', value: entry.location })
    if (entry.contact_name) rows.push({ label: 'Who to contact', value: entry.contact_name })
    if (entry.contact_detail) rows.push({ label: 'Phone or email', value: entry.contact_detail })
    if (entry.status && entry.status !== 'confirmed') {
        rows.push({ label: 'How sure', value: entry.status })
    }

    // Said out loud, because an entry that quietly stayed in the Hub looks
    // exactly like one that went out. Private is not a failure: it was never
    // meant to leave.
    if (entry.scope !== 'private') {
        rows.push({
            label: 'Google',
            value: entry.google_synced_at ? 'On the calendar' : 'Not on the calendar',
        })
    }

    return (
        <Modal title={entry.title} onClose={onClose}>
            <div className="px-6 py-4">
                <div className="mb-4 flex flex-wrap gap-1.5">
                    <span className={`${badge} ${kindTag(entry.kind)}`}>{kindLabel(entry.kind)}</span>
                    {labelsOf(entry).map(label => (
                        <span key={label} className={`${badge} bg-gray-100 text-gray-700`}>{label}</span>
                    ))}
                </div>

                <dl className="divide-y divide-border">
                    {rows.map(r => (
                        <div key={r.label} className="flex justify-between gap-4 py-2 text-sm">
                            <dt className="text-muted flex-shrink-0">{r.label}</dt>
                            <dd className="font-medium text-gray-900 text-right break-words">{r.value}</dd>
                        </div>
                    ))}
                </dl>

                {entry.note && (
                    <p className="text-sm text-gray-800 bg-app-bg rounded-lg p-3 mt-4 whitespace-pre-line break-words">
                        {entry.note}
                    </p>
                )}
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
                {canEdit && (
                    <button type="button" onClick={onEdit} className={primaryButton()}>Edit</button>
                )}
            </div>
        </Modal>
    )
}
