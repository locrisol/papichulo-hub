// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddOptions from './AddOptions'

// Adding a whole choice at once, and whether the options get rows of their own
// on the allergen sheet.
//
// An option is kept off the dish's own row. Picked out of All products it is
// something not sold on its own, so it has no row anywhere else either, and
// left unticked its allergens were on no row of the sheet at all. So the box
// starts ticked for those, and off for a menu category, whose items already
// have rows.

const PRODUCTS = [
    { id: 'choc', name: 'Chocolate Sauce', section: 'Dry', unit: 'KG' },
    { id: 'cola', name: 'Cola', section: 'Dry', unit: 'Units' },
]

function show(onAdd = vi.fn()) {
    render(
        <AddOptions
            menuCategories={[{ id: 'drinks', name: 'Drinks' }]}
            menuItems={[{ id: 'm-cola', name: 'Cola', category_id: 'drinks' }]}
            allComponents={[{ menu_item_id: 'm-cola', product_id: 'cola' }]}
            products={PRODUCTS}
            existingGroups={[]}
            existing={[]}
            onAdd={onAdd}
            onClose={vi.fn()}
        />,
    )
    return onAdd
}

const listBox = () => screen.getByRole('checkbox', { name: /List them separately/ })
const source = () => screen.getByLabelText('Fill the list from')

describe('the List them separately box', () => {
    it('starts ticked when the list comes from All products', async () => {
        const me = userEvent.setup()
        show()
        await me.selectOptions(source(), 'products')
        expect(listBox()).toBeChecked()
    })

    it('starts off for a menu category, whose items have rows of their own', async () => {
        const me = userEvent.setup()
        show()
        await me.selectOptions(source(), 'drinks')
        expect(listBox()).not.toBeChecked()
    })

    // Somebody who changed it meant it.
    it('stays the way it was set when the list changes', async () => {
        const me = userEvent.setup()
        show()
        await me.selectOptions(source(), 'products')
        await me.click(listBox())
        await me.selectOptions(source(), 'drinks')
        await me.selectOptions(source(), 'products')
        expect(listBox()).not.toBeChecked()
    })

    it('is what the options are saved with', async () => {
        const me = userEvent.setup()
        const onAdd = show()
        await me.type(screen.getByLabelText('What the choice is called'), 'Sauce')
        await me.selectOptions(source(), 'products')
        await me.click(screen.getByText('Chocolate Sauce'))
        await me.type(screen.getByText('Chosen (1)').parentElement.querySelector('input'), '50')
        await me.click(screen.getByRole('button', { name: /Add 1 option/ }))
        expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ product_id: 'choc', list_separately: true })])
    })
})
