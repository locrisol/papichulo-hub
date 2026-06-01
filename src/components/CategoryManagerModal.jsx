import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CategoryManagerModal({ categories, onClose, onChange }) {
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [newSortOrder, setNewSortOrder] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editSortOrder, setEditSortOrder] = useState('')

  // Sort by sort_order for display
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  async function handleAdd(e) {
    e.preventDefault()
    setError('')

    const name = newName.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    const sortOrder = parseInt(newSortOrder)
    if (isNaN(sortOrder)) {
      setError('Sort order must be a number')
      return
    }

    const { error: e1 } = await supabase
      .from('menu_categories')
      .insert({ name, sort_order: sortOrder })

    if (e1) {
      // 23505 = unique violation on name
      setError(e1.code === '23505' ? 'A category with that name already exists' : e1.message)
      return
    }

    setNewName('')
    setNewSortOrder('')
    onChange()
  }

  function startEdit(category) {
    setEditingId(category.id)
    setEditName(category.name)
    setEditSortOrder(String(category.sort_order))
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditSortOrder('')
    setError('')
  }

  async function saveEdit(category) {
    setError('')

    const name = editName.trim()
    if (!name) {
      setError('Name is required')
      return
    }
    const sortOrder = parseInt(editSortOrder)
    if (isNaN(sortOrder)) {
      setError('Sort order must be a number')
      return
    }

    const { error: e1 } = await supabase
      .from('menu_categories')
      .update({ name, sort_order: sortOrder })
      .eq('id', category.id)

    if (e1) {
      setError(e1.code === '23505' ? 'A category with that name already exists' : e1.message)
      return
    }

    cancelEdit()
    onChange()
  }

  async function toggleActive(category) {
    const { error: e1 } = await supabase
      .from('menu_categories')
      .update({ is_active: !category.is_active })
      .eq('id', category.id)

    if (e1) setError(e1.message)
    else onChange()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Manage Categories</h2>
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
            Categories control how menu items are grouped on the menu items list and the public allergen page. Lower sort order appears first. Deactivate a category instead of deleting it so existing menu items keep their reference.
          </p>

          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Order</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Status</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Actions</th>
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
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={editSortOrder}
                          onChange={e => setEditSortOrder(e.target.value)}
                          className="w-full border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                        />
                      </td>
                      <td className={`px-3 py-2 ${c.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(c)}
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
                    </>
                  ) : (
                    <>
                      <td className={`px-3 py-2 font-medium ${c.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                        {c.name}
                      </td>
                      <td className={`px-3 py-2 ${c.is_active ? 'text-gray-700' : 'text-gray-400'}`}>
                        {c.sort_order}
                      </td>
                      <td className={`px-3 py-2 text-xs ${c.is_active ? 'text-green-700' : 'text-gray-400'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3">
                          <button
                            onClick={() => startEdit(c)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(c)}
                            className={`text-xs font-medium ${
                              c.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'
                            }`}
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
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Category</h3>
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
              <div className="w-24">
                <input
                  type="number"
                  value={newSortOrder}
                  onChange={e => setNewSortOrder(e.target.value)}
                  placeholder="Order"
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