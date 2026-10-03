import { useState } from 'react'
import { fieldClass, labelClass, hintClass, secondaryButton } from '@/lib/controlStyles'
import { PASSWORD_HINT } from '@/lib/password'

// One box for a new password, with Show.
//
// Not two boxes to type it twice. On a phone the second box is where the
// typing goes wrong, and Show lets somebody see what they typed instead. A
// typo costs one email to reset it.
//
// new-password tells Chrome and Safari to offer a strong one and save it.
export default function NewPasswordField({ id = 'new-password', label = 'New password', value, onChange, autoFocus = false }) {
    const [shown, setShown] = useState(false)

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
            <p className={hintClass}>{PASSWORD_HINT}</p>
        </div>
    )
}
