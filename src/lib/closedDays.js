// A day the store did not open.
//
// It was being typed twice. The roster has it on the day, because you know in
// August that you are shutting on the 25th and you mark it while you build the
// week. The sales screens have it too, because a day with no takings is not a
// day that took nothing, and every average would be wrong if it were counted.
//
// Two boxes, two screens, and nothing keeping them in step. Tick one and the
// other still said the opposite, which is worse than having only one of them:
// the roster prints Closed while the cost dashboard quietly averages a zero
// into the week.
//
// The roster's day is the one that decides now. It is the forward looking
// statement, it is the table whose whole job is days that are not like the
// others, and it exists whether or not anybody ever enters sales for that date.
// Ticking the box on either screen writes both, so it is one decision made once
// and the other screen already knows.
//
// The column on sales_records is kept and kept correct rather than dropped. The
// cost dashboard and the labour page read it, a day recorded before any of this
// still carries it, and there is no reading of history where throwing it away
// makes anything truer.

// Is this day closed, given what both sides say?
//
// The roster's day wins when it has anything to say at all. The sales row is
// the fallback, which is what makes every day recorded before these two were
// tied together still read correctly.
export function dayIsClosed(dayNote, salesRow) {
    if (dayNote) return !!dayNote.is_closed
    return !!salesRow?.is_closed
}

// The dates in a set of day notes that are closed.
export function closedDates(dayNotes) {
    return new Set((dayNotes || []).filter(n => n?.is_closed).map(n => n.note_date))
}

// Is there anything left on a day note besides the fact it exists?
//
// A normal day has no row at all, which is what keeps this from becoming three
// hundred and sixty five rows a year saying nothing. So unticking closed on a
// day that says nothing else has to take the row with it.
export function noteIsEmpty(note) {
    return !note?.opens_at
        && !note?.closes_at
        && !note?.is_closed
        && !note?.is_bank_holiday
        && !note?.note
        && !note?.message
        && !(Array.isArray(note?.extras) && note.extras.length > 0)
}

// What the sales screens should do to the roster's day, given a set of days
// they are about to save.
//
// Worked out here rather than in the page so it can be tested: which dates need
// a row written, which need one cleared, and which need one deleting outright.
export function planNoteWrites(existingNotes, days) {
    const byDate = {}
    for (const note of existingNotes || []) byDate[note.note_date] = note

    const close = []
    const open = []
    const remove = []

    for (const { date, closed } of days || []) {
        const note = byDate[date]

        if (closed) {
            // The id matters. A day that already has a row gets that one field
            // changed, because writing a whole row over it would take its
            // hours, its label and its deliveries with it.
            if (!note?.is_closed) close.push({ date, id: note?.id ?? null })
            continue
        }

        if (!note?.is_closed) continue

        // It was closed and is not any more. Either the rest of the day still
        // says something, or the row has nothing left to be.
        if (noteIsEmpty({ ...note, is_closed: false })) remove.push(note.id)
        else open.push(date)
    }

    return { close, open, remove }
}

// Putting a plan into the database.
//
// Kept beside the working out rather than in the screens, because three screens
// can tick this box and three copies of this would be three chances for one of
// them to be subtly different.
export async function applyNoteWrites(supabase, { restaurantId, userId, plan }) {
    const stamp = { updated_by: userId ?? null, updated_at: new Date().toISOString() }

    for (const { date, id } of plan.close) {
        const { error } = id
            ? await supabase.from('day_notes').update({ is_closed: true, ...stamp }).eq('id', id)
            : await supabase.from('day_notes').insert({
                restaurant_id: restaurantId,
                note_date: date,
                is_closed: true,
                ...stamp,
            })
        if (error) return error
    }

    if (plan.open.length) {
        const { error } = await supabase.from('day_notes')
            .update({ is_closed: false, ...stamp })
            .eq('restaurant_id', restaurantId)
            .in('note_date', plan.open)
        if (error) return error
    }

    if (plan.remove.length) {
        const { error } = await supabase.from('day_notes').delete().in('id', plan.remove)
        if (error) return error
    }

    return null
}

// The other direction, for when the box is ticked on the roster.
//
// Only rows that already exist. A day nobody has entered sales for needs no row
// saying it took nothing, and every screen that counts trading days treats a
// missing row the same way it treats a closed one.
export async function mirrorClosedToSales(supabase, { restaurantId, date, closed }) {
    const { error } = await supabase.from('sales_records')
        .update({ is_closed: closed })
        .eq('restaurant_id', restaurantId)
        .eq('sale_date', date)
    return error || null
}
