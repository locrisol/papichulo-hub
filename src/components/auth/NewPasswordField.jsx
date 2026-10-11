import { useState } from 'react'
import { fieldClass, labelClass, secondaryButton } from '@/lib/controlStyles'
import { PASSWORD_RULES } from '@/lib/password'

// One box for a new password, with Show.
//
// Not two boxes to type it twice. On a phone the second box is where the
// typing goes wrong, and Show lets somebody see what they typed instead. A
// typo costs one email to reset it.
//
// Under it, what the password needs, each line ticked as it is met while they
// type (his, 11 October), so nobody finds out only on pressing Save.
//
// new-password tells Chrome and Safari to offer a strong one and save it.
export default function NewPasswordField({ id = 'new-password', label = 'New password', value, onChange, autoFocus = false }) {
    const [shown, setShown] = useState(false)
    const typed = String(value || '')

    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            <div className="flex gap-2">
                <input
                    id={id}
                    type={shown ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    autoFocus={autoFocus}
                    required
                    aria-describedby={`${id}-rules`}
                    className={fieldClass}
                />
                <button
                    type="button"
                    onClick={() => setShown(s => !s)}
                    aria-pressed={shown}
                    aria-controls={id}
                    className={secondaryButton}
                >
                    {shown ? 'Hide' : 'Show'}
                </button>
            </div>
            <ul id={`${id}-rules`} aria-label="The password needs" className="mt-2 space-y-1">
                {PASSWORD_RULES.map(rule => {
                    const met = rule.met(typed)
                    return (
                        <li key={rule.key} className={`flex items-center gap-2 text-sm ${met ? 'text-green-800' : 'text-muted'}`}>
                            <span
                                aria-hidden="true"
                                className={`w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center ${met ? 'bg-green-700 text-white' : 'border border-gray-400'}`}
                            >
                                {met && (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </span>
                            <span>
                                {rule.label}
                                <span className="sr-only">{met ? ': done' : ': not yet'}</span>
                            </span>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
