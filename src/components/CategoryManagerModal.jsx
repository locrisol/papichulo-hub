import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { modalFooter, rowButton, tableHeadRow } from '../lib/controlStyles'
import Modal from './Modal'
import { ModalSectionBar } from './ModalSection'

// Manages the categories menu items are grouped under.
//
// These do two jobs at once, which is why they matter more than they look. They
// group the menu items list for the manager, and they are also the headings a
// customer sees on the public allergen page, in the same order.
//
// sort_order decides that order, lowest first, and it is typed in rather than
// set with arrows. Categories are deactivated and never deleted, because menu
// items point at one by id and deleting would leave them pointing at nothing.
export default function CategoryManagerModal({ categories, onClose, onChange }) {
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  // The name breaks a tie, so two categories that have never been arranged
  // against each other still come out the same way every time.
  const sorted = [...categories].sort((a, b) =>
    (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))

  // Up and down rather than a number you type, the same as the sales platforms
  // and the till rows. A typed number was slower, and let two categories end up
  // holding the same one with nothing saying which came first.
  async function moveCategory(index, direction) {
    const target = index + direction
    if (target < 0 || target >= sorted.length) return

    setError('')

    const reordered = sorted.slice()
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)

    const results = await Promise.all(reordered.map((c, i) =>
      supabase.from('menu_categories').update({ sort_order: i }).eq('id', c.id)))

    const failed = results.find(r => r.error)
    if (failed) { setError(friendlyError(failed.error)); return }

    onChange()
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')

    const name = newName.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    // Onto the end. Somewhere is where a new one goes, and the arrows are how
    // it gets anywhere else.
    const { error: e1 } = await supabase
      .from('menu_categories')
      .insert({ name, sort_order: sorted.length })

    if (e1) {
      // 23505 = unique violation on name
      setError(e1.code === '23505' ? 'A category with that name already exists' : friendlyError(e1))
      return
    }

    setNewName('')
    onChange()
  }

  function startEdit(category) {
    setEditingId(category.id)
    setEditName(category.name)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setError('')
  }

  async function saveEdit(category) {
    setError('')

    const name = editName.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    const { error: e1 } = await supabase
      .from('menu_categories')
      .update({ name })
      .eq('id', category.id)

    if (e1) {
      setError(e1.code === '23505' ? 'A category with that name already exists' : friendlyError(e1))
      return
    }

    cancelEdit()
    onChange()
  }

  // Cans and bottled water carry none of the fourteen and fill the sheet with
  // rows saying so. On by default, because a drink that does carry something,
  // a coffee with milk or a beer with gluten, belongs on the sheet like
  // anything else.
  async function toggleSheet(category) {
    const { error: e1 } = await supabase
      .from('menu_categories')
      .update({ on_allergen_sheet: !category.on_allergen_sheet })
      .eq('id', category.id)

    if (e1) setError(friendlyError(e1))
    else onChange()
  }

  async function toggleActive(category) {
    const { error: e1 } = await supabase
      .from('menu_categories')
      .update({ is_active: !category.is_active })
      .eq('id', category.id)

    if (e1) setError(friendlyError(e1))
    else onChange()
  }

  return (
    <Modal title="Manage categories" onClose={onClose} width="max-w-2xl">

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
          )}

          <p className="text-xs text-gray-500 mb-4">
            Categories control how menu items are grouped on the menu items list and the public allergen page. Lower sort order appears first. Deactivate a category instead of deleting it so existing menu items keep their reference.
          </p>

          <table className="w-full text-sm mb-6">
            <thead>
              <tr className={tableHeadRow}>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-24">Order</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-24">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-32">Allergen sheet</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr key={c.id} className={`border-b border-border ${!c.is_active ? 'bg-red-50' : ''}`}>
                  {editingId === c.id ? (
                    <>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">
                        Use the arrows
                      </td>
                      <td className={`px-3 py-2 ${c.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">
                        {c.on_allergen_sheet === false ? 'Hidden' : 'Shown'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(c)}
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
                    </>
                  ) : (
                    <>
                      <td className={`px-3 py-2 font-medium ${c.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                        {c.name}
                      </td>
                      {/* Up and down rather than a number you type, the same as
                          the sales platforms and the till rows. */}
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveCategory(i, -1)}
                            disabled={i === 0}
                            className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                            aria-label={`Move ${c.name} up`}
                          >
                            &uarr;
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCategory(i, 1)}
                            disabled={i === sorted.length - 1}
                            className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                            aria-label={`Move ${c.name} down`}
                          >
                            &darr;
                          </button>
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-xs ${c.is_active ? 'text-green-700' : 'text-gray-400'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleSheet(c)}
                          className={rowButton(c.on_allergen_sheet === false ? 'plain' : 'good')}
                        >
                          {c.on_allergen_sheet === false ? 'Hidden' : 'Shown'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3">
                          <button
                            onClick={() => startEdit(c)}
                            className={rowButton('edit')}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(c)}
                            className={rowButton(c.is_active ? 'danger' : 'good')}
                          >
                            {c.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bg-gray-50 rounded-lg p-4">
            <ModalSectionBar title="Add a category" />
            <form onSubmit={handleAdd} className="flex gap-2 items-start">
              <div className="flex-1">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Category name"
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
            <p className="text-xs text-gray-400 mt-2">
              Suggested gaps of 10 (e.g. 10, 20, 30) so you can insert a category between two existing ones without renumbering.
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
    </Modal>
  )
}