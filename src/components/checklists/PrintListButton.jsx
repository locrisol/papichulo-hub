import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { rowButton, modalFooter, primaryButton, secondaryButton } from '@/lib/controlStyles'
import { friendlyError } from '@/lib/errors'
import { listTree } from '@/lib/checklists'
import { signer } from '@/components/checklists/signPhotos'
import Modal from '@/components/ui/Modal'
import PdfButton from '@/components/ui/PdfButton'

// A blank copy of a list to print and pin up, with a space on every line for
// who did it and when.
//
// When anything on the list has a guide picture it asks whether to print them.
// They are what makes the paper as useful as the phone, and they are also most
// of the ink, so it is the person at the printer's call.
export default function PrintListButton({ list, restaurant, onError, className = '' }) {
    const [asking, setAsking] = useState(null)

    const failed = err => onError?.(friendlyError(err))

    async function read() {
        const [cats, tasks] = await Promise.all([
            supabase.from('checklist_categories').select('*').eq('checklist_id', list.id),
            supabase.from('checklist_tasks').select('*').eq('checklist_id', list.id),
        ])
        if (cats.error || tasks.error) throw cats.error || tasks.error
        return listTree(cats.data, tasks.data)
    }

    async function print(tree, withPictures) {
        const { blankListPdf, loadPictures } = await import('@/lib/checklistPdf')
        const paths = withPictures
            ? tree.flatMap(g => g.elements.flatMap(e => [...(e.task.guide_photos || []), ...e.subs.flatMap(s => s.guide_photos || [])]))
            : []
        const pictures = await loadPictures(paths, signer)
        await blankListPdf({ restaurant, list, tree, pictures })
    }

    async function start() {
        const tree = await read()
        const pictured = tree.some(g => g.elements.some(e => e.task.guide_photos?.length || e.subs.some(s => s.guide_photos?.length)))
        if (pictured) setAsking(tree)
        else await print(tree, false)
    }

    // The question goes away once the PDF is made, or once it could not be.
    async function answer(withPictures) {
        try {
            await print(asking, withPictures)
        } finally {
            setAsking(null)
        }
    }

    return (
        <>
            <PdfButton make={start} onError={failed} className={`${rowButton('plain')} ${className}`}>
                Print
            </PdfButton>
            {asking && (
                <Modal title="Print the list" onClose={() => setAsking(null)} width="max-w-md">
                    <p className="px-6 py-5 text-sm text-gray-700">
                        Some things on this list have a picture showing what is meant. Print them too?
                    </p>
                    <div className={modalFooter}>
                        <PdfButton make={() => answer(false)} onError={failed} className={secondaryButton}>
                            Without pictures
                        </PdfButton>
                        <PdfButton make={() => answer(true)} onError={failed} className={primaryButton()}>
                            With pictures
                        </PdfButton>
                    </div>
                </Modal>
            )}
        </>
    )
}
