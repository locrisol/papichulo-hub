import { useState } from 'react'
import { useConfirm } from '../context/ConfirmContext'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { modalFooter, rowButton, tableHeadRow, secondaryButton, fieldClass } from '../lib/controlStyles'
import ArrangeList from './ArrangeList'
import Modal from './Modal'
import { ModalSectionBar } from './ModalSection'

// Manages the categories menu items are grouped under.
//
// These do two jobs at once, which is why they matter more than they look. They
// group the menu items list for the manager, and they are also the headings a
// customer sees on the public allergen page, in the same order.
//
// sort_order decides that order, lowest first, and it is set in the Arrange
// dialog rather than typed or nudged with arrows on every row. Categories are
// deactivated and never deleted, because menu items point at one by id and
// deleting would leave them pointing at nothing.
export default function CategoryManagerModal({ categories, onClose, onChange }) {
  const confirm = useConfirm()
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [arranging, setArranging] = useState(false)

  // The name breaks a tie, so two categories that have never been arranged
  // against each other still come out the same way every time.
  const sorted = [...categories].sort((a, b) =>
    (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))

  // The whole order written at once, from the arrange dialog.
  //
  // Renumbered from zero rather than swapping two numbers. The order used to be
  // typed by hand, so nothing ever stopped two categories sharing a number or
  // the numbers having gaps, and swapping two equal ones looked like nothing
  // had happened. Rewriting the lot makes what is stored match what is shown.
  async function saveOrder(order) {
    setError('')

    const results = await Promise.all(order.map((c, i) =>
      supabase.from('menu_categories').update({ sort_order: i }).eq('id', c.id)))

    const failed = results.find(r => r.error)
    if (failed) { setError(friendlyError(failed.error)); return }

    setArranging(false)
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
    // Onto the end. Somewhere is where a new one goes, and Arrange is how it
    // gets anywhere else.
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

  // Only on the way out, and it says the part nobody expects: the customer
  // facing allergen sheet reads active categories only, so switching one off
  // takes every dish in it off the page customers scan in the shop.
  async function toggleActive(category) {
    if (category.is_active) {
      const ok = await confirm({
        title: `Turn off ${category.name}?`,
        message: 'It stops appearing in Menu Items, and every dish in it comes off the allergen sheet '
          + 'customers read. The dishes themselves are not touched and turning it back on brings them back.',
        confirmLabel: 'Turn it off',
        tone: 'danger',
      })
      if (!ok) return
    }

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
            Categories group the menu items list, and they are the headings customers read on the
            allergen page, in the same order. Turn one off rather than deleting it, so the dishes in it
            keep pointing at something.
          </p>

          {/* Arranging is a button rather than a pair of arrows on every row.
              A row here carries a name, an order, a status, the allergen sheet
              switch and two buttons, and on a phone the arrows were taking
              width from the only thing you read while arranging, the name. The
              same dialog the menu items list uses. */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs text-muted">
              {sorted.length} {sorted.length === 1 ? 'category' : 'categories'}, in the order they are read in.
            </p>
            <button
              type="button"
              onClick={() => setArranging(true)}
              disabled={sorted.length < 2}
              className={secondaryButton}
            >
              Arrange
            </button>
          </div>

          {/* A card each on a phone. Five columns inside a dialog left the
              allergen sheet switch and both buttons off the side of the
              screen, so the two things this dialog exists for could not be
              reached there at all. */}
          <div className="sm:hidden space-y-2 mb-6">
            {sorted.map(c => (
              <div
                key={c.id}
                className={`rounded-lg border border-border p-3 ${c.is_active ? 'bg-white' : 'bg-red-50'}`}
              >
                {editingId === c.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className={fieldClass}
                      aria-label="Category name"
                    />
                    <div className="flex flex-wrap gap-3 mt-2">
                      <button onClick={() => saveEdit(c)} className={rowButton('good')}>Save</button>
                      <button onClick={cancelEdit} className={rowButton()}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-sm font-semibold ${c.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                        {c.name}
                      </span>
                      <span className={`text-xs whitespace-nowrap ${c.is_active ? 'text-green-700' : 'text-gray-400'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {c.on_allergen_sheet === false
                        ? 'Not on the allergen sheet'
                        : 'On the allergen sheet'}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-border">
                      <button onClick={() => startEdit(c)} className={rowButton('edit')}>Edit</button>
                      <button
                        onClick={() => toggleSheet(c)}
                        className={rowButton(c.on_allergen_sheet === false ? 'plain' : 'good')}
                      >
                        {c.on_allergen_sheet === false ? 'Put on the sheet' : 'Take off the sheet'}
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        className={rowButton(c.is_active ? 'danger' : 'good')}
                      >
                        {c.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <table className="hidden sm:table w-full text-sm mb-6">
            <thead>
              <tr className={tableHeadRow}>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-24">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-32">Allergen sheet</th>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
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
                      <td className={`px-3 py-2 ${c.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">
                        {c.on_allergen_sheet === false ? 'Hidden' : 'Shown'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(c)} className={rowButton('good')}>Save</button>
                          <button onClick={cancelEdit} className={rowButton()}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={`px-3 py-2 font-medium ${c.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                        {c.name}
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
                          <button onClick={() => startEdit(c)} className={rowButton('edit')}>Edit</button>
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
              It goes on the end. Use Arrange to move it.
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
            title="Arrange categories"
            note="This is the order they are listed in, and the order they print in on the allergen sheet."
            items={sorted}
            onSave={saveOrder}
            onClose={() => setArranging(false)}
          />
        )}
    </Modal>
  )
}