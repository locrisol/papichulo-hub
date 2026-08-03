import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRestaurant } from '../context/RestaurantContext'
import { friendlyError } from '../lib/errors'
import { tableHeadRow } from '../lib/controlStyles'

const BUCKETS = [
  { value: 'online_platform', label: 'Online Platform' },
  { value: 'catering', label: 'Catering' },
]

const BUCKET_LABEL = {
  online_platform: 'Online Platforms',
  catering: 'Catering',
}

export default function SalesPlatformsModal({ onClose, onChange }) {
  const { activeRestaurant } = useRestaurant()

  const [platforms, setPlatforms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add form
  const [newName, setNewName] = useState('')
  const [newBucket, setNewBucket] = useState('online_platform')

  // Inline edit
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editBucket, setEditBucket] = useState('online_platform')

  useEffect(() => {
    if (activeRestaurant) fetchPlatforms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurant])

  async function fetchPlatforms() {
    setLoading(true)
    const { data, error: e1 } = await supabase
      .from('sales_platforms')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      // sort_order is what the platform list is arranged by, then name to break
      // ties. Without an order, deactivating a platform moved it in the list.
      .order('sort_order')
      .order('name')

    if (e1) setError(friendlyError(e1))
    else setPlatforms(data || [])
    setLoading(false)
  }

  function platformsForBucket(bucket) {
    return platforms
      .filter(p => p.bucket === bucket)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')

    const name = newName.trim()
    if (!name) {
      setError('Name is required')
      return
    }

    // Goes on the end of its bucket. There is no number to type any more, you
    // move it up with the arrows once it is in the list.
    const sortOrder = platformsForBucket(newBucket).length

    const { error: e1 } = await supabase
      .from('sales_platforms')
      .insert({
        restaurant_id: activeRestaurant.id,
        name,
        bucket: newBucket,
        sort_order: sortOrder,
      })

    if (e1) {
      setError(e1.code === '23505' ? 'A platform with that name already exists' : friendlyError(e1))
      return
    }

    setNewName('')
    fetchPlatforms()
    onChange && onChange()
  }

  // Moves a platform one place up or down inside its own bucket.
  //
  // The whole bucket is renumbered from zero rather than swapping two numbers.
  // The order used to be typed by hand, so nothing ever stopped two platforms
  // sharing a number or the numbers having gaps, and swapping two equal ones
  // would look like the arrow had done nothing. Rewriting the lot makes the
  // stored order match what is on screen.
  async function movePlatform(bucket, index, direction) {
    const rows = platformsForBucket(bucket)
    const target = index + direction
    if (target < 0 || target >= rows.length) return

    setError('')

    const reordered = rows.slice()
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)

    const results = await Promise.all(
      reordered.map((p, i) =>
        supabase.from('sales_platforms').update({ sort_order: i }).eq('id', p.id)
      )
    )

    const failed = results.find(r => r.error)
    if (failed) {
      setError(friendlyError(failed.error))
      return
    }

    fetchPlatforms()
    onChange && onChange()
  }

  function startEdit(p) {
    setEditingId(p.id)
    setEditName(p.name)
    setEditBucket(p.bucket)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditBucket('online_platform')
    setError('')
  }

  async function saveEdit(p) {
    setError('')

    const name = editName.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    const { error: e1 } = await supabase
      .from('sales_platforms')
      .update({ name, bucket: editBucket })
      .eq('id', p.id)

    if (e1) {
      setError(e1.code === '23505' ? 'A platform with that name already exists' : friendlyError(e1))
      return
    }

    cancelEdit()
    fetchPlatforms()
    onChange && onChange()
  }

  async function toggleActive(p) {
    const { error: e1 } = await supabase
      .from('sales_platforms')
      .update({ is_active: !p.is_active })
      .eq('id', p.id)

    if (e1) setError(friendlyError(e1))
    else {
      fetchPlatforms()
      onChange && onChange()
    }
  }

  function renderRow(p, index, rows) {
    if (editingId === p.id) {
      return (
        <tr key={p.id} className="border-b border-border">
          <td className="px-3 py-2">
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
          </td>
          <td className="px-3 py-2">
            <select
              value={editBucket}
              onChange={e => setEditBucket(e.target.value)}
              className="w-full border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            >
              {BUCKETS.map(b => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </td>
          {/* Nothing to edit here any more. The order is set with the arrows. */}
          <td className="px-3 py-2 w-24"></td>
          <td className="px-3 py-2 w-32">
            <div className="flex gap-2">
              <button
                onClick={() => saveEdit(p)}
                className="text-xs font-medium text-green-700 hover:text-green-800"
              >
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )
    }

    return (
      <tr key={p.id} className={`border-b border-border ${!p.is_active ? 'bg-red-50' : ''}`}>
        <td className={`px-3 py-2 font-medium ${p.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
          {p.name}
        </td>
        <td className={`px-3 py-2 text-xs ${p.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
          {p.is_active ? 'Active' : 'Inactive'}
        </td>
        {/* Up and down arrows, the same as the weekly sales row order list in
            restaurant settings. It used to be a number you typed in, which was
            slower and let two platforms end up with the same one. */}
        <td className="px-3 py-2 w-24">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => movePlatform(p.bucket, index, -1)}
              disabled={index === 0}
              className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
              aria-label={`Move ${p.name} up`}
            >
              &uarr;
            </button>
            <button
              type="button"
              onClick={() => movePlatform(p.bucket, index, 1)}
              disabled={index === rows.length - 1}
              className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
              aria-label={`Move ${p.name} down`}
            >
              &darr;
            </button>
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-3">
            <button
              onClick={() => startEdit(p)}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Edit
            </button>
            <button
              onClick={() => toggleActive(p)}
              className={`text-xs font-medium ${
                p.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'
              }`}
            >
              {p.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  function renderBucketSection(bucket) {
    const rows = platformsForBucket(bucket)
    return (
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {BUCKET_LABEL[bucket]}
        </h3>
        {rows.length === 0 ? (
          <p className="text-xs text-gray-400 italic mb-2">No platforms in this bucket yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadRow}>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Order</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody>{rows.map(renderRow)}</tbody>
          </table>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Manage sales platforms</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
          )}

          <p className="text-xs text-gray-500 mb-4">
            Platforms feed the Online Platform and Catering totals on the sales entry form. Deactivate a platform instead of deleting it so past sales records keep their reference. Use the arrows to set the order they appear in.
          </p>

          {loading ? (
            <p className="text-sm text-gray-400">Loading platforms...</p>
          ) : (
            <>
              {renderBucketSection('online_platform')}
              {renderBucketSection('catering')}
            </>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Add platform</h3>
            <form onSubmit={handleAdd} className="flex gap-2 items-start">
              <div className="flex-1">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Platform name"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
              </div>
              <div className="w-40">
                <select
                  value={newBucket}
                  onChange={e => setNewBucket(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                >
                  {BUCKETS.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
              >
                Add
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-2">
              A new platform goes on the end of its group. Use the arrows to move it up.
            </p>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-border bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
