import { useState } from 'react'
import { supabase } from '../lib/supabase'

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
        setError(insertErr.message)
      }
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onCreated(data)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-bold text-gray-900">Start a stock take</h2>
            <p className="text-sm text-muted mt-1">
              Once started, you and your team can begin counting.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Type
            </label>
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
            <label htmlFor="notes" className="block text-sm font-semibold text-gray-900 mb-1">
              Notes <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="notes"
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. End of May 2026"
              maxLength={200}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <p className="text-xs text-muted mt-1">
              A short label to help identify this session later.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold bg-accent hover:bg-accent/90 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {submitting ? 'Starting...' : 'Start stock take'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}