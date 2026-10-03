import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { fieldClass, hintClass, labelClass, modalFooter, primaryButton, secondaryButton } from '@/lib/controlStyles'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'

// Starts a stock take session.
//
// Only one session can be open per restaurant at a time, and that is enforced by
// a partial unique index in the database rather than by checking here first.
// Checking first would let two people both look, both see nothing open, and both
// start one. The insert failing is what actually prevents it, so the error from
// the database is the thing worth showing.
//
// About the type. It is recorded on the session and used for the title and the
// badge in the history, but it does not yet change what you count: every session
// type lists every active product. The plan is for count_frequency on products
// to decide which ones a weekly or daily session includes. That column exists in
// the database and nothing reads it yet, so the descriptions below describe the
// intent rather than what happens today.
const TYPE_OPTIONS = [
  {
    value: 'monthly',
    label: 'Monthly',
    description: 'Full count of all products',
  },
  {
    value: 'weekly',
    label: 'Weekly',
    description: 'Products marked for weekly counting',
  },
  {
    value: 'daily',
    label: 'Daily',
    description: 'Quick count of high-value or high-turnover products',
  },
]

export default function StartStockTakeModal({ onClose, onCreated, restaurantId, userId }) {
  const [type, setType] = useState('monthly')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    setError('')
    setSubmitting(true)

    const { data, error: insertErr } = await supabase
      .from('stock_takes')
      .insert({
        restaurant_id: restaurantId,
        type,
        notes: notes.trim() || null,
        started_by: userId,
        status: 'in_progress',
      })
      .select()
      .single()

    if (insertErr) {
      // The partial unique index will reject if there's already an active session.
      if (insertErr.code === '23505') {
        setError('There is already an active stock take for this restaurant. Close it before starting a new one.')
      } else {
        setError(friendlyError(insertErr))
      }
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onCreated(data)
  }

  // The shared shell rather than a fourth hand rolled overlay. This one had
  // written its own heading bar as well as its own backdrop, so it was the one
  // dialog in the app with a white header instead of the green one, and the
  // only one Escape would not close.
  return (
    <Modal title="Start a stock take" onClose={onClose} width="max-w-md">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-5">
            <p className="text-sm text-muted">
              Once started, you and your team can begin counting.
            </p>

            {/* Type */}
            <div role="radiogroup" aria-labelledby="start-type">
              <p id="start-type" className={labelClass}>
                Type
              </p>
              <div className="space-y-2">
                {TYPE_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      type === opt.value
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={opt.value}
                      checked={type === opt.value}
                      onChange={() => setType(opt.value)}
                      className="mt-0.5 accent-accent"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-muted mt-0.5">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes (optional) */}
            <div>
              <label htmlFor="notes" className={labelClass}>
                Notes (optional)
              </label>
              <input
                id="notes"
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. End of May 2026"
                maxLength={200}
                className={fieldClass}
              />
              <p className={hintClass}>
                A name to help you find this stock take later.
              </p>
            </div>

            <ErrorBanner>{error}</ErrorBanner>
          </div>

          <div className={modalFooter}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={secondaryButton}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={primaryButton('lg')}
            >
              {submitting ? 'Starting...' : 'Start stock take'}
            </button>
          </div>
        </form>
    </Modal>
  )
}