// Matching what somebody typed against what is written on a label.
//
// Half the store is named in Spanish and the labels carry the accents:
// Chile de Árbol, Jalapeño, Piña, Habanero Rojo. Nobody types them. Somebody
// searching for "arbol" got nothing back and reasonably concluded the product
// was not there, which on a stock take means it gets missed.
//
// So both sides are folded before they are compared. The accents stay on the
// screen, where they belong and where they are correct; they are only ignored
// while deciding whether two pieces of text are the same word.
//
// NFD splits a letter into its base and its mark, and the mark is then thrown
// away, so á becomes a and ñ becomes n. It is the same for the other direction:
// typing "Árbol" finds a product written "Arbol".

export function fold(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()
}

// Does this text contain what was typed, accents and case aside?
//
// An empty search matches everything, because a list that empties itself the
// moment somebody clears the box is a list that looks broken.
export function matches(text, term) {
    const wanted = fold(term)
    if (!wanted) return true
    return fold(text).includes(wanted)
}
