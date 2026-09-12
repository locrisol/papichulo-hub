// Which menu items can be added to a choice in one go.
//
// A menu item is offered only if exactly one real product sits behind it.
//
// A can of Coke is one product and so is a tub of salsa. Guacamole made of five
// things is not, and nothing can say which of the five is "the guacamole", so
// it is left out rather than guessed at. The count of those is shown, because
// silently offering eight of eleven is how somebody ends up with a group that
// is missing three options and no reason to look.
// Packaging is not the thing being chosen.
//
// A salsa sold on its own is the salsa plus the pot it goes in, which is two
// components and would otherwise look like something too complicated to add.
// It is not: the pot is how it is handed over when sold by itself, and a salsa
// going into a burrito does not get one.
//
// So packaging is left out both when working out what a menu item is, and from
// what gets added. A burrito costed with a dip pot in it is a burrito costed
// wrong.
function isPackaging(product) {
    return product?.section === 'Packaging'
}

export function offerable(menuItems, components, products) {
    const offered = []
    let skipped = 0
    let packagingLeftOut = 0

    for (const item of menuItems) {
        const mine = components
            .filter(c => c.menu_item_id === item.id)
            .map(c => ({ line: c, product: products.find(p => p.id === c.product_id) }))

        const real = mine.filter(({ product }) => product && !isPackaging(product))
        packagingLeftOut += mine.length - real.length

        // Still more than one thing after the pot comes off, so nothing can say
        // which of them is the item. Guacamole made of five products is that.
        if (real.length !== 1) { skipped += 1; continue }

        offered.push({ item, product: real[0].product })
    }

    return { offered, skipped, packagingLeftOut }
}
