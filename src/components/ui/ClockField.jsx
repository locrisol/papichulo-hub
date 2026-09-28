import { fieldClass, compactField } from '@/lib/controlStyles'

// Picking a time that is whatever it happens to be.
//
// The sister of TimeField, and the difference is what the time is for. A shift
// starts on the quarter hour, always, so TimeField offers a list of quarter
// hours and nothing else: it is faster to pick from and it cannot be typed
// wrong. Nothing else in the app works like that. A delivery arrives at 11:20,
// a meeting is at 14:05, and a catering job is handed over at 18:45, and a list
// of quarter hours makes those either impossible or a lie.
//
// So this hands the job to the browser, which is what these fields were before
// and what he asked to go back to. That also answers the phone: Android draws a
// dial, iPhone draws a wheel, and a computer draws three little boxes you can
// type into. Three different controls is exactly the thing TimeField exists to
// avoid, and here it is the point, because each one of them is that device's
// own way of picking any minute of the day.
//
// The same onChange shape as TimeField, the value rather than the event, so the
// two can be swapped for each other without touching the caller.
export default function ClockField({
    value = '',
    onChange,
    compact = false,
    className = '',
    ...rest
}) {
    return (
        <input
            type="time"
            value={value || ''}
            onChange={e => onChange?.(e.target.value)}
            className={`${compact ? compactField : fieldClass} ${className}`}
            {...rest}
        />
    )
}
