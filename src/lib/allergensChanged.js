// Telling the sidebar that a product's allergens may just have been set.
//
// The red count on Products is worked out in AppLayout, which reads it again
// when the page changes in the catalogue. A save does not change the page: the
// Allergens page stays where it is, and the Edit dialog on Products closes back
// onto the same list. Without this the count stayed one too high until you went
// somewhere else, which reads as the save not having worked.
//
// A browser event rather than something handed down, because the pages that
// save and the layout that counts know nothing about each other, and this is
// all they need to share. Named once, here, so the two ends cannot be spelt
// differently.
const ALLERGENS_CHANGED = 'papichulo:allergens-changed'

// Said by a save that can change the count: the allergens themselves, a MIX's
// recipe, or a product added or switched on or off.
export function allergensChanged() {
    window.dispatchEvent(new Event(ALLERGENS_CHANGED))
}

// Calls listener after each one, until the function it hands back is called.
export function onAllergensChanged(listener) {
    window.addEventListener(ALLERGENS_CHANGED, listener)
    return () => window.removeEventListener(ALLERGENS_CHANGED, listener)
}
