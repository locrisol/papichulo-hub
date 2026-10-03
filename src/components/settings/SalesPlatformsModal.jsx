import { useState, useEffect } from 'react'
import { useConfirm } from '@/context/confirm'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/context/restaurant'
import { friendlyError } from '@/lib/errors'
import { tableHeadRow, modalFooter, rowButton, secondaryButton, fieldClass, denseField, inactiveBadge, hintClass, primaryButton } from '@/lib/controlStyles'
import ArrangeList from '@/components/ui/ArrangeList'
import { ModalSectionBar } from '@/components/ui/ModalSection'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'

// The stored value stays 'catering'. Only what you read changes, so nothing
// already recorded against it has to move.
const BUCKETS = [
  { value: 'online_platform', label: 'Online platform' },
  { value: 'catering', label: 'Corporate' },
]

const BUCKET_LABEL = {
  online_platform: 'Online platforms',
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
      setError('Enter a name')
      return
    }

    // Its figures are kept under a key that never changes, so a rename keeps
    // them. The database makes a new platform's key the name it is given, so
    // none is sent here, which also works on a database from before platforms
    // had a key column. One renamed since still keeps its figures
    // under the name it had, so that name cannot be a new platform's key or
    // the two would share one set of figures.
    const renamed = platforms.find(p => p.key === name && p.name !== name)
    if (renamed) {
      setError(`${renamed.name} was called ${name} before, so a new platform cannot use that name. `
        + `Enter another name, or rename ${renamed.name} back.`)
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
      setError('Enter a name')
      return
    }

    // The group decides which total a platform's figures count toward, and it
    // is read off the platform, not kept with each day. So moving one takes
    // every week already entered with it, which can be right but should not
    // happen by a slip of the select.
    if (editBucket !== p.bucket) {
      const ok = await confirm({
        title: `Move ${p.name} to ${BUCKET_LABEL[editBucket]}?`,
        message: `Its figures in every week already entered will count toward ${BUCKET_LABEL[editBucket]} `
          + `instead of ${BUCKET_LABEL[p.bucket]}, not only the weeks from now on.`,
        confirmLabel: 'Move',
      })
      if (!ok) return
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
        message: 'It stops appearing on new weeks. Weeks that already have figures for it keep them and '
          + 'still show it. Press Bring back to show it on new weeks again.',
        confirmLabel: 'Retire',
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
              className={denseField}
            />
          </td>
          <td className="px-3 py-2">
            <select
              value={editBucket}
              onChange={e => setEditBucket(e.target.value)}
              className={denseField}
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
        <td className={`px-3 py-2 font-medium ${p.is_active ? 'text-gray-900' : 'text-muted'}`}>
          {p.name}
        </td>
        <td className="px-3 py-2 text-xs text-gray-700">
          {p.is_active ? 'Active' : <span className={inactiveBadge}>Retired</span>}
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
              {p.is_active ? 'Retire' : 'Bring back'}
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
          <p className="text-xs text-muted italic mb-2">No platforms in this group yet.</p>
        ) : (
          <>
          {/* A card each on a phone. Three columns inside a dialog put Retire
              half off the side of the screen, and retiring is most of what this
              list is for. */}
          <div className="sm:hidden space-y-2">
            {rows.map(p => (
              <div
                key={p.id}
                className={`rounded-lg border border-border p-3 ${p.is_active ? 'bg-white' : 'bg-red-50'}`}
              >
                {editingId === p.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className={`${fieldClass} mb-2`}
                      aria-label="Platform name"
                    />
                    <select
                      value={editBucket}
                      onChange={e => setEditBucket(e.target.value)}
                      className={fieldClass}
                      aria-label="Which group"
                    >
                      {BUCKETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-3 mt-2">
                      <button onClick={() => saveEdit(p)} className={rowButton('good')}>Save</button>
                      <button onClick={cancelEdit} className={rowButton()}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-sm font-semibold ${p.is_active ? 'text-gray-900' : 'text-muted'}`}>
                        {p.name}
                      </span>
                      {p.is_active
                        ? <span className="text-xs whitespace-nowrap text-green-700">Active</span>
                        : <span className={inactiveBadge}>Retired</span>}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-border">
                      <button onClick={() => startEdit(p)} className={rowButton('edit')}>Edit</button>
                      <button
                        onClick={() => toggleActive(p)}
                        className={rowButton(p.is_active ? 'danger' : 'good')}
                      >
                        {p.is_active ? 'Retire' : 'Bring back'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className={tableHeadRow}>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-24">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody>{rows.map(renderRow)}</tbody>
          </table>
          </>
        )}
      </div>
    )
  }

  return (
    <Modal title="Manage sales platforms" onClose={onClose} width="max-w-2xl">

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <ErrorBanner className="mb-4">{error}</ErrorBanner>
          )}

          <p className="text-xs text-muted mb-4">
            Platforms feed the Online platforms and Corporate totals on the sales entry form. Retire one rather than deleting it, so weeks already entered keep their figures. Arrange sets the order they appear in.
          </p>

          {loading ? (
            <p className="text-sm text-muted">Loading platforms...</p>
          ) : (
            <>
              {renderBucketSection('online_platform')}
              {renderBucketSection('catering')}
            </>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <ModalSectionBar title="Add a platform" />
            <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-start">
              <div className="flex-1 min-w-[9rem]">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Platform name"
                  className={fieldClass}
                />
              </div>
              <div className="w-40">
                <select
                  value={newBucket}
                  onChange={e => setNewBucket(e.target.value)}
                  className={fieldClass}
                >
                  {BUCKETS.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className={primaryButton()}
              >
                Add
              </button>
            </form>
            <p className={hintClass}>
              A new platform goes on the end of its group. Use Arrange to move it.
            </p>
          </div>
        </div>

        <div className={modalFooter}>
          <button
            onClick={onClose}
            className={primaryButton()}
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
