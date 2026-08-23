import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { useConfirm } from '../context/ConfirmContext'
import { POSITION_COLOURS, nextColour } from '../lib/team'
import { badge } from '../lib/controlStyles'

// The positions a restaurant uses: Kitchen, Counter, Delivery, whatever they
// call them.
//
// Empty to begin with on purpose. Nobody knows what a restaurant calls its jobs
// except the restaurant, and a list of guesses would just be a list to delete.
//
// Retiring rather than deleting, for the same reason nothing else here deletes.
// A position that was used on a roster in March has to keep drawing correctly in
// March. Retired means it cannot be given to anybody new.
export default function PositionsModal({ positions, restaurantId, onClose, onChanged }) {
    const confirm = useConfirm()
    const [name, setName] = useState('')
    const [colour, setColour] = useState(nextColour(positions))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [editing, setEditing] = useState(null)

    async function add(e) {
        e.preventDefault()
        if (!name.trim()) return
        setSaving(true)
        setError('')

        const { error: err } = await supabase.from('positions').insert({
            restaurant_id: restaurantId,
            name: name.trim(),
            colour,
            sort_order: positions.length,
        })

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        setName('')
        setColour(nextColour([...positions, { colour }]))
        onChanged()
    }

    async function rename(position) {
        if (!editing?.name.trim()) return
        const { error: err } = await supabase
            .from('positions')
            .update({ name: editing.name.trim(), colour: editing.colour })
            .eq('id', position.id)

        if (err) { setError(friendlyError(err)); return }
        setEditing(null)
        onChanged()
    }

    async function toggleActive(position) {
        if (position.is_active) {
            const ok = await confirm({
                title: `Retire ${position.name}?`,
                message: 'It stays on every roster that already used it and cannot be given to anybody new.',
                confirmLabel: 'Retire it',
            })
            if (!ok) return
        }

        const { error: err } = await supabase
            .from('positions')
            .update({ is_active: !position.is_active })
            .eq('id', position.id)

        if (err) setError(friendlyError(err))
        else onChanged()
    }

    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'

    // Buttons rather than a dropdown, the same as the invoice categories. A
    // dropdown only shows the colour once the choice is already made.
    const swatches = (value, onPick) => (
        <div className="flex flex-wrap gap-1.5">
            {POSITION_COLOURS.map(c => (
                <button
                    key={c.value}
                    type="button"
                    onClick={() => onPick(c.value)}
                    aria-label={c.name}
                    aria-pressed={value === c.value}
                    className={`w-7 h-7 rounded-md transition-transform ${
                        value === c.value ? 'ring-2 ring-offset-2 ring-gray-800 scale-110' : ''
                    }`}
                    style={{ backgroundColor: c.value }}
                />
            ))}
        </div>
    )

    return (
        <Modal title="Positions" onClose={onClose}>
            <div className="p-5">
                {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

                {positions.length === 0 ? (
                    <p className="text-sm text-gray-400 italic mb-5">
                        None yet. Add whatever this restaurant calls its jobs.
                    </p>
                ) : (
                    <div className="divide-y divide-border mb-5">
                        {positions.map(p => (
                            <div key={p.id} className="py-3">
                                {editing?.id === p.id ? (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={editing.name}
                                            onChange={e => setEditing({ ...editing, name: e.target.value })}
                                            className={fieldCls}
                                        />
                                        {swatches(editing.colour, c => setEditing({ ...editing, colour: c }))}
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setEditing(null)}
                                                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => rename(p)}
                                                className="px-4 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="w-4 h-4 rounded flex-shrink-0"
                                            style={{ backgroundColor: p.colour }}
                                        />
                                        <span className={`flex-1 text-sm font-medium ${
                                            p.is_active ? 'text-gray-900' : 'text-gray-400 line-through'
                                        }`}>
                                            {p.name}
                                        </span>
                                        {!p.is_active && (
                                            <span className={`${badge} bg-gray-100 text-gray-600`}>Retired</span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setEditing({ id: p.id, name: p.name, colour: p.colour })}
                                            className="text-sm text-blue-600 hover:text-blue-800"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleActive(p)}
                                            className="text-sm text-gray-500 hover:text-gray-800"
                                        >
                                            {p.is_active ? 'Retire' : 'Bring back'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <form onSubmit={add} className="border-t border-border pt-4 space-y-3">
                    <label className="text-xs text-gray-500 block">Add one</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className={fieldCls}
                        placeholder="Kitchen, Counter, Delivery"
                    />
                    {swatches(colour, setColour)}
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={saving || !name.trim()}
                            className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    )
}
