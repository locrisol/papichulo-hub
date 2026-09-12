// The box that narrows a list.
//
// The catalogue had one written into the page with a border-border edge, which
// is cream on a cream background, so it read as a gap rather than as a box you
// could type in. That is the same fault the secondary buttons were fixed for:
// a visible grey edge, a small shadow to lift it off the page, and darker text.
//
// A magnifier so it is recognisable before it is read, and a cross so there is
// a way back to the whole list that is not deleting a word at a time. Tall
// enough to be a real target, since the stock take one is used on a phone with
// one hand while the other is holding a box.
//
// Two screens have one of these, so it lives here rather than being written out
// twice and drifting.
export default function SearchBox({
    value, onChange, placeholder = 'Search...', label, className = '',
}) {
    return (
        <div className={`relative ${className || 'w-full sm:w-80'}`}>
            <svg
                className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>

            <input
                type="search"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={label || placeholder}
                // The browser puts its own cross on a search input, so there
                // were two of them, and the native one only appears on hover
                // and cannot be styled to match anything. Ours stays, because
                // it is always visible and is the same size as a thumb.
                className="w-full h-11 bg-white border border-gray-300 rounded-lg shadow-sm pl-9 pr-9 text-sm text-gray-800 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
            />

            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label="Clear the search"
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    )
}
