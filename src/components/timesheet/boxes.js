// Finding the next box in the grid.
//
// Its own file because both the week grid and the touch bar need it, and a
// component file that also exports helpers breaks fast refresh. More to the
// point: the two must agree about what "next" means, or the arrow on a tablet
// would go somewhere Tab does not.
//
// The order is the DOM order, which is the order the browser tabs in, which is
// along a person from Sunday to Saturday. That is what he asked for, and it is
// what we get by not writing any code to change it.

export function boxesIn(root) {
    return Array.from(root?.querySelectorAll('input[data-r]') || [])
}

export function boxAt(root, wanted) {
    return boxesIn(root).find(el => (
        Number(el.dataset.r) === wanted.r
        && Number(el.dataset.d) === wanted.d
        && Number(el.dataset.s) === wanted.s
        && Number(el.dataset.i) === wanted.i
    )) || null
}

function go(box) {
    if (box) { box.focus(); box.select() }
    return box
}

export function focusBox(root, wanted) {
    return go(boxAt(root, wanted))
}

// The next box along, which runs off the end of a person's week into the next
// person's Sunday. Nothing happens at the very end, which is right: there is
// nowhere else to be.
export function stepFrom(root, el, dir) {
    const all = boxesIn(root)
    return go(all[all.indexOf(el) + dir])
}
