import { useState, useEffect } from 'react'
import { useConfirm } from '../context/ConfirmContext'
import { supabase } from '../lib/supabase'
import { useRestaurant } from '../context/RestaurantContext'
import { friendlyError } from '../lib/errors'
import { tableHeadRow, modalFooter, rowButton, secondaryButton } from '../lib/controlStyles'
import ArrangeList from './ArrangeList'
import { ModalSectionBar } from './ModalSection'
import Modal from './Modal'

// The stored value stays 'catering'. Only what you read changes, so nothing
// already recorded against it has to move.
const BUCKETS = [
  { value: 'online_platform', label: 'Online Platform' },
  { value: 'catering', label: 'Corporate' },
]

const BUCKET_LABEL = {
  online_platform: 'Online Platforms',
  catering: 'Corporate',
}

export default function SalesPlatformsModal({ onClose, onChange }) {
  const confirm = useConfirm()
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
  const [arranging, setArranging] = useState(null)

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

    // Goes on the end of its bucket. Arrange is how it gets anywhere else.
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

  // One bucket reordered, written in one go from the arrange dialog.
  //
  // Renumbered from zero rather than swapping two numbers. The order used to be
  // typed by hand, so nothing ever stopped two platforms sharing a number or
  // the numbers having gaps, and swapping two equal ones looked like nothing
  // had happened. Rewriting the lot makes what is stored match what is shown.
  async function saveOrder(order) {
    setError('')

    const results = await Promise.all(
      order.map((p, i) =>
        supabase.from('sales_platforms').update({ sort_order: i }).eq('id', p.id)
      )
    )

    const failed = results.find(r => r.error)
    if (failed) {
      setError(friendlyError(failed.error))
      return
    }

    setArranging(null)
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

  // Only on the way out.
  async function toggleActive(p) {
    if (p.is_active) {
      const ok = await confirm({
        title: `Retire ${p.name}?`,
        message: 'It stops appearing on the sales screens from now on. Weeks already entered keep their '
          + 'figures for it, and turning it back on brings the row back.',
        confirmLabel: 'Retire it',
        tone: 'danger',
      })
      if (!ok) return
    }

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

  function renderRow(p) {
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
          <td className="px-3 py-2 w-32">
            <div className="flex gap-2">
              <button
                onClick={() => saveEdit(p)}
                className={rowButton('good')}
              >
                Save
              </button>
              <button
                onClick={cancelEdit}
                className={rowButton()}
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
        <td className="px-3 py-2">
          <div className="flex gap-3">
            <button
              onClick={() => startEdit(p)}
              className={rowButton('edit')}
            >
              Edit
            </button>
            <button
              onClick={() => toggleActive(p)}
              className={rowButton(p.is_active ? 'danger' : 'good')}
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
        {/* Arranging is a button per group rather than arrows on every row.
            Each group keeps its own order, so it is the same shape as
            arranging one category of the menu. */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            {BUCKET_LABEL[bucket]}
          </h2>
          {rows.length > 1 && (
            <button type="button" onClick={() => setArranging(bucket)} className={secondaryButton}>
              Arrange
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-gray-400 italic mb-2">No platforms in this bucket yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadRow}>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-24">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody>{rows.map(renderRow)}</tbody>
          </table>
        )}
      </div>
    )
  }

  return (
    <Modal title="Manage sales platforms" onClose={onClose} width="max-w-2xl">

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
            <ModalSectionBar title="Add a platform" />
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
              A new platform goes on the end of its group. Use Arrange to move it.
            </p>
          </div>
        </div>

        <div className={modalFooter}>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            Done
          </button>
        </div>

        {arranging && (
          <ArrangeList
            title={`Arrange ${BUCKET_LABEL[arranging]}`}
            note="This is the order these rows appear in on the sales screens."
            items={platformsForBucket(arranging)}
            onSave={saveOrder}
            onClose={() => setArranging(null)}
          />
        )}
    </Modal>
  )
}
