import { useState } from 'react'
import { teamGaps, countGaps } from '../../lib/teamGaps'

// What is missing from the team list, as one line you can open.
//
// Closed by default and gone entirely when there is nothing to say, because
// this is housekeeping rather than an alarm. Amber, not red: none of it is
// broken, it is a list of things nobody has got round to.
//
// Each person is a button that opens their form. That is the difference
// between a list of problems and a list you can work down: told that Bruno has
// no date of birth, the next thing anybody wants is Bruno's form, and making
// them go and find him in a list of forty is how a warning becomes wallpaper.
export default function TeamGaps({ employees, today, onOpen }) {
    const [open, setOpen] = useState(false)

    const rows = teamGaps(employees, today)
    if (rows.length === 0) return null

    const total = countGaps(rows)

    return (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-100/60 transition-colors"
            >
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-amber-900">
                        {total} thing{total === 1 ? '' : 's'} missing
                        {' from '}
                        {rows.length} {rows.length === 1 ? 'person' : 'people'}
                    </span>
                    {!open && (
                        <span className="block text-xs text-amber-800 mt-0.5">
                            {rows.slice(0, 3).map(r => r.employee.full_name).join(', ')}
                            {rows.length > 3 && `, and ${rows.length - 3} more`}
                        </span>
                    )}
                </span>
                <span className="text-amber-800 text-lg leading-none" aria-hidden="true">
                    {open ? '−' : '+'}
                </span>
            </button>

            {open && (
                <ul className="border-t border-amber-200 divide-y divide-amber-200">
                    {rows.map(({ employee, gaps }) => (
                        <li key={employee.id}>
                            <button
                                type="button"
                                onClick={() => onOpen(employee)}
                                className="w-full text-left px-4 py-2.5 hover:bg-amber-100/60 transition-colors"
                            >
                                <span className="block text-sm font-medium text-amber-900">
                                    {employee.full_name}
                                </span>
                                {/* Every one of them, not a count. "3 things
                                    missing" makes you open the form to find out
                                    what they are, which is the trip this is
                                    here to save. */}
                                <span className="block text-xs text-amber-800 mt-0.5">
                                    {gaps.map(g => g.text).join(' · ')}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
