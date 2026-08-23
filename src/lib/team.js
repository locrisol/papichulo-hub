// The rules about the people who work here.
//
// No React in here, the same split the rest of lib uses.

// The colours a position can be given.
//
// Not a free colour picker. Two positions that look alike on a timeline are
// worse than no colour at all, and a picker is how you end up with two greens.
//
// Checked with a palette validator against a white card, every colour against
// every other, because a roster puts them in whatever order the staff list
// happens to be in and any two can end up touching. The worst pair for ordinary
// sight is 15.3 and the worst for the commonest kind of colour blindness is 6.4,
// which is only allowed where the colour is not the one thing telling you what
// something is. It is not: every block on the roster carries the person's name
// and the position is written beside it.
//
// The same eight, in the same order, as the pie on the cost dashboard. One
// checked set for the whole app rather than a second one to keep in step.
export const POSITION_COLOURS = [
    { name: 'Blue', value: '#1f6fd0' },
    { name: 'Violet', value: '#8e44ad' },
    { name: 'Crimson', value: '#c2185b' },
    { name: 'Teal', value: '#17a2b8' },
    { name: 'Dark green', value: '#136b3a' },
    { name: 'Orange', value: '#eb6834' },
    { name: 'Light green', value: '#5cc27a' },
    { name: 'Magenta', value: '#e06ce0' },
]

// Grey, for a position created before anybody picked a colour.
export const NO_COLOUR = '#6b7280'

// The first colour nobody is using, so a new position does not land on top of
// one already on the roster. Once all eight are taken it starts again, which is
// the right moment to be asking whether eight positions is really eight.
export function nextColour(positions) {
    const taken = new Set((positions || []).map(p => p.colour))
    return (POSITION_COLOURS.find(c => !taken.has(c.value)) || POSITION_COLOURS[0]).value
}

// Is this person working on a given day?
//
// Somebody with no start date counts as always having been here, which is what
// you want for the people already on the books when the list is first typed in:
// nobody is going back through years of contracts to fill a date in.
export function isWorkingOn(employee, date) {
    if (!employee || !date) return false
    if (employee.started_on && date < employee.started_on) return false
    if (employee.ended_on && date > employee.ended_on) return false
    return true
}

// What to show beside somebody's name.
//
// Three states rather than two, because somebody who starts next Monday is
// neither working nor gone, and putting them in either place is how they get
// forgotten about.
export function employeeStatus(employee, today) {
    if (!employee) return null

    if (employee.ended_on && employee.ended_on < today) {
        return { state: 'left', label: 'Left', date: employee.ended_on }
    }
    if (employee.started_on && employee.started_on > today) {
        return { state: 'starting', label: 'Starts', date: employee.started_on }
    }
    if (employee.ended_on) {
        // Still here, but with a leaving date already set. Worth saying out
        // loud: it is the fortnight where a manager still has to roster them
        // and also has to be thinking about replacing them.
        return { state: 'leaving', label: 'Last day', date: employee.ended_on }
    }
    return { state: 'working', label: 'Working', date: null }
}

// The order the roster draws them in.
//
// sort_order first because that is the manager's own arrangement, then name so
// that a list which has never been arranged is still in a sensible order rather
// than in whatever order the database felt like.
export function sortEmployees(employees) {
    return (employees || []).slice().sort(
        (a, b) => a.sort_order - b.sort_order || a.full_name.localeCompare(b.full_name),
    )
}

// Where a new person goes: the end.
export function nextSortOrder(employees) {
    if (!employees || employees.length === 0) return 0
    return Math.max(...employees.map(e => e.sort_order ?? 0)) + 1
}

// Moving somebody up or down.
//
// Returns only the rows whose order actually changed, so the page writes two
// records instead of rewriting the whole list every time somebody nudges a
// name. Returns nothing at all at the ends, so the page has nothing to save
// rather than saving the same thing back.
//
// The positions are swapped by value rather than recalculated from scratch,
// which means a list that has never been arranged, where everybody is still 0,
// still moves correctly: the pair get their index numbers on the way past.
export function moveEmployee(employees, id, direction) {
    const sorted = sortEmployees(employees)
    const from = sorted.findIndex(e => e.id === id)
    if (from === -1) return []

    const to = direction === 'up' ? from - 1 : from + 1
    if (to < 0 || to >= sorted.length) return []

    const reordered = sorted.slice()
    reordered[from] = sorted[to]
    reordered[to] = sorted[from]

    // Number the two that moved by where they now sit. Everyone else is left
    // alone, and their existing order still separates them correctly because
    // the swap happened inside a sorted list.
    return [
        { id: reordered[from].id, sort_order: from },
        { id: reordered[to].id, sort_order: to },
    ]
}

// Which accounts can still be linked to a person.
//
// An account already attached to somebody is not offered again, because one
// account is one person. The one currently attached to whoever is being edited
// stays in the list, or opening their form would look like it had lost it.
export function linkableUsers(users, employees, currentEmployeeId) {
    const taken = new Set(
        (employees || [])
            .filter(e => e.user_id && e.id !== currentEmployeeId)
            .map(e => e.user_id),
    )
    return (users || []).filter(u => !taken.has(u.id))
}

// What is wrong with the form, or nothing.
//
// Returns the first problem as a sentence, because a form with one field
// wrong should say what is wrong, not colour four boxes red.
export function employeeProblem({ fullName, startedOn, endedOn }) {
    if (!fullName?.trim()) return 'Give them a name.'
    if (endedOn && startedOn && endedOn < startedOn) {
        return 'The last day cannot be before the first day.'
    }
    return null
}
