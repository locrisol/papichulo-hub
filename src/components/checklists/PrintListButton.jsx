import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { rowButton, modalFooter, primaryButton, secondaryButton } from '@/lib/controlStyles'
import { friendlyError } from '@/lib/errors'
import { listTree } from '@/lib/checklists'
import { signer } from '@/components/checklists/signPhotos'
import Modal from '@/components/ui/Modal'

// A blank copy of a list to print and pin up, with a space on every line for
// who did it and when.
//
// When anything on the list has a guide picture it asks whether to print them.
// They are what makes the paper as useful as the phone, and they are also most
// of the ink, so it is the person at the printer's call.
export default function PrintListButton({ list, restaurant, onError, className = '' }) {
    const [asking, setAsking] = useState(null)
    const [busy, setBusy] = useState(false)

    async function read() {
        const [cats, tasks] = await Promise.all([
            supabase.from('checklist_categories').select('*').eq('checklist_id', list.id),
            supabase.from('checklist_tasks').select('*').eq('checklist_id', list.id),
        ])
        if (cats.error || tasks.error) throw cats.error || tasks.error
        return listTree(cats.data, tasks.data)
    }

    async function print(tree, withPictures) {
        setBusy(true)
        try {
            const { blankListPdf, loadPictures } = await import('@/lib/checklistPdf')
            const paths = withPictures
                ? tree.flatMap(g => g.elements.flatMap(e => [...(e.task.guide_photos || []), ...e.subs.flatMap(s => s.guide_photos || [])]))
                : []
            const pictures = await loadPictures(paths, signer)
            await blankListPdf({ restaurant, list, tree, pictures })
        } catch (err) {
            onError?.(friendlyError(err))
        } finally {
            setBusy(false)
            setAsking(null)
        }
    }

    async function start() {
        setBusy(true)
        try {
            const tree = await read()
            const pictured = tree.some(g => g.elements.some(e => e.task.guide_photos?.length || e.subs.some(s => s.guide_photos?.length)))
            setBusy(false)
            if (pictured) setAsking(tree)
            else await print(tree, false)
        } catch (err) {
            setBusy(false)
            onError?.(friendlyError(err))
        }
    }

    return (
        <>
            <button type="button" onClick={start} disabled={busy} className={`${rowButton('plain')} ${className}`}>
                {busy ? 'Making PDF...' : 'Print'}
            </button>
            {asking && (
                <Modal title="Print the list" onClose={() => setAsking(null)} width="max-w-md">
                    <p className="px-6 py-5 text-sm text-gray-700">
                        Some things on this list have a picture showing what is meant. Print them too?
                    </p>
                    <div className={modalFooter}>
                        <button type="button" onClick={() => print(asking, false)} disabled={busy} className={secondaryButton}>
                            Without pictures
                        </button>
                        <button type="button" onClick={() => print(asking, true)} disabled={busy} className={primaryButton()}>
                            {busy ? 'Making PDF...' : 'With pictures'}
                        </button>
                    </div>
                </Modal>
            )}
        </>
    )
}
