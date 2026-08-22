import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRestaurant } from '../context/RestaurantContext'
import { friendlyError } from '../lib/errors'
import { tableHeadRow, card } from '../lib/controlStyles'

// The rows on the till receipt.
//
// These used to be one database column each, so every time the till changed we
// wrote a migration and deployed. In August 2026 the till split Outside
// Catering into Clockmeal, Lunch Team, Feedr and Catering, and the POS is being
// replaced after that, so there was no sense pretending the list would hold
// still. This screen is what replaced the migrations.
//
// Super Admin only, and the database enforces that too, not just this screen.
// Changing a row here changes the shape of every day entered afterwards, which
// is not something to do from a phone in the middle of a shift.

// Turns a label into the key the amounts get stored under.
//
// The key never changes once a row exists. That is the whole reason there is a
// key at all: sales_platforms stores its amounts under the platform's name, so
// renaming a platform orphans every figure it ever took. Here the label is only
// ever what you read, so "Online Sales" could become "Online Platforms" with
// every figure back to March following it.
function keyFrom(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function SalesTendersModal({ onClose, onChange }) {
  const { activeRestaurant } = useRestaurant()

  const [tenders, setTenders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newLabel, setNewLabel] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')

  useEffect(() => {
    if (activeRestaurant) fetchTenders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurant])

  async function fetchTenders() {
    setLoading(true)
    const { data, error: e1 } = await supabase
      .from('sales_tenders')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .order('sort_order')
      .order('label')

    if (e1) setError(friendlyError(e1))
    else setTenders(data || [])
    setLoading(false)
  }

  const ordered = [...tenders].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  )

  async function handleAdd(e) {
    e.preventDefault()
    const label = newLabel.trim()
    if (!label) {
      setError('Give the row a name')
      return
    }

    const key = keyFrom(label)
    if (!key) {
      setError('That name has no letters or numbers in it')
      return
    }

    // Goes on the end. The order is set with the arrows afterwards, rather than
    // asking anyone to type a number and work out where it lands.
    const nextOrder = ordered.length ? Math.max(...ordered.map(t => t.sort_order)) + 1 : 0

    const { error: e1 } = await supabase
      .from('sales_tenders')
      .insert({ restaurant_id: activeRestaurant.id, key, label, sort_order: nextOrder })

    if (e1) {
      // A duplicate key usually means the row is already there but retired,
      // which is worth saying, because reactivating it keeps its history and
      // adding a new one under a different name would not.
      setError(e1.code === '23505'
        ? 'There is already a row with that name. If it is retired, reactivate it instead of adding it again, so its old figures stay with it.'
        : friendlyError(e1))
      return
    }

    setError('')
    setNewLabel('')
    await fetchTenders()
    onChange?.()
  }

  // Moves a row one place. The whole list is renumbered from zero rather than
  // two rows swapping numbers, so a list that has drifted sorts itself out.
  async function moveTender(index, direction) {
    const target = index + direction
    if (target < 0 || target >= ordered.length) return

    const next = [...ordered]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)

    setTenders(next.map((t, i) => ({ ...t, sort_order: i })))

    const results = await Promise.all(
      next.map((t, i) => supabase.from('sales_tenders').update({ sort_order: i }).eq('id', t.id))
    )
    const failed = results.find(r => r.error)
    if (failed) {
      setError(friendlyError(failed.error))
      await fetchTenders()
      return
    }
    onChange?.()
  }

  function startEdit(t) {
    setEditingId(t.id)
    setEditLabel(t.label)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditLabel('')
  }

  async function saveEdit(t) {
    const label = editLabel.trim()
    if (!label) {
      setError('Give the row a name')
      return
    }

    // Only the label changes. The key stays as it was so the figures already
    // stored under it stay attached to this row.
    const { error: e1 } = await supabase
      .from('sales_tenders')
      .update({ label })
      .eq('id', t.id)

    if (e1) { setError(friendlyError(e1)); return }

    setError('')
    cancelEdit()
    await fetchTenders()
    onChange?.()
  }

  async function toggleActive(t) {
    const { error: e1 } = await supabase
      .from('sales_tenders')
      .update({ is_active: !t.is_active })
      .eq('id', t.id)

    if (e1) { setError(friendlyError(e1)); return }
    await fetchTenders()
    onChange?.()
  }

  async function toggleCounts(t) {
    const { error: e1 } = await supabase
      .from('sales_tenders')
      .update({ counts_toward_gross: !t.counts_toward_gross })
      .eq('id', t.id)

    if (e1) { setError(friendlyError(e1)); return }
    await fetchTenders()
    onChange?.()
  }

  function renderRow(t, index) {
    if (editingId === t.id) {
      return (
        <tr key={t.id} className="border-b border-border">
          <td className="px-3 py-2" colSpan={2}>
            <input
              type="text"
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              className="w-full border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            <p className="text-xs text-gray-400 mt-1">
              Stored as {t.key}, which does not change. Every figure already entered stays with this row.
            </p>
          </td>
          <td className="px-3 py-2 w-24"></td>
          <td className="px-3 py-2 w-40">
            <div className="flex gap-2">
              <button onClick={() => saveEdit(t)} className="text-xs font-medium text-green-700 hover:text-green-800">
                Save
              </button>
              <button onClick={cancelEdit} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )
    }

    return (
      <tr key={t.id} className={`border-b border-border ${!t.is_active ? 'bg-red-50' : ''}`}>
        <td className={`px-3 py-2 font-medium ${t.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
          {t.label}
          <span className="block text-xs font-normal text-gray-400">{t.key}</span>
        </td>
        <td className="px-3 py-2 text-xs">
          <span className={t.is_active ? 'text-gray-500' : 'text-gray-400'}>
            {t.is_active ? 'Active' : 'Retired'}
          </span>
          <button
            onClick={() => toggleCounts(t)}
            className={`block mt-1 ${t.counts_toward_gross ? 'text-gray-500' : 'text-amber-600'} hover:underline`}
          >
            {t.counts_toward_gross ? 'Counts toward gross' : 'Not counted'}
          </button>
        </td>
        <td className="px-3 py-2 w-24">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => moveTender(index, -1)}
              disabled={index === 0}
              className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
              aria-label={`Move ${t.label} up`}
            >
              &uarr;
            </button>
            <button
              type="button"
              onClick={() => moveTender(index, 1)}
              disabled={index === ordered.length - 1}
              className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
              aria-label={`Move ${t.label} down`}
            >
              &darr;
            </button>
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-3">
            <button onClick={() => startEdit(t)} className="text-xs font-medium text-blue-600 hover:text-blue-800">
              Rename
            </button>
            <button
              onClick={() => toggleActive(t)}
              className={`text-xs font-medium ${
                t.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'
              }`}
            >
              {t.is_active ? 'Retire' : 'Bring back'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-serif text-lg font-bold text-gray-900">Till receipt rows</h2>
          <p className="text-xs text-gray-500 mt-1">
            The rows on the sales screens for {activeRestaurant?.name}, in the order the till prints them. Gross and
            net sales are always at the top and are not in this list.
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 text-red-600 text-sm rounded-lg p-3">{error}</div>
        )}

        <div className="px-6 py-4 overflow-y-auto">
          {/* Retiring rather than deleting is the point of this screen. A row
              that is deleted takes its history with it; a retired one keeps
              showing on the weeks it was actually used. */}
          <p className="text-xs text-gray-500 mb-4">
            Retiring a row takes it off new days but leaves it on every week that already has figures for it, so an old
            week still shows the till as it was. Renaming a row keeps everything entered under it.
          </p>

          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : ordered.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No rows yet. Add the first one below.</p>
          ) : (
            <div className={`${card} overflow-x-auto overflow-y-hidden`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={tableHeadRow}>
                    <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Row</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Status</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-24">Order</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>{ordered.map((t, i) => renderRow(t, i))}</tbody>
              </table>
            </div>
          )}

          <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Add a row</label>
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Ordu App"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              Add
            </button>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
