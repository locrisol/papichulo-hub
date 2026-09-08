// Which menu items can be added to a choice in one go.
//
// A menu item is offered only if exactly one product sits behind it.
//
// A can of Coke is one product and so is a tub of salsa. Guacamole made of five
// things is not, and nothing can say which of the five is "the guacamole", so
// it is left out rather than guessed at. The count of those is shown, because
// silently offering eight of eleven is how somebody ends up with a group that
// is missing three options and no reason to look.
export function offerable(menuItems, components, products) {
    const offered = []
    let skipped = 0

    for (const item of menuItems) {
        const mine = components.filter(c => c.menu_item_id === item.id)
        if (mine.length !== 1) { skipped += 1; continue }

        const product = products.find(p => p.id === mine[0].product_id)
        if (!product) { skipped += 1; continue }

        offered.push({ item, product })
    }

    return { offered, skipped }
}
