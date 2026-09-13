/// <reference types="vite/client" />

// What Vite adds to the language that plain JavaScript does not have, so the
// editor stops underlining it in red.
//
// Two things, both of which the app uses and neither of which TypeScript can
// know about on its own:
//
//   import logo from '@/assets/PapiChuloLogo.png'
//   import.meta.env.VITE_SUPABASE_URL
//
// An image is not a module as far as the language is concerned, and
// import.meta has no env on it. Vite declares both, and this is the line that
// pulls those declarations in. It is the file Vite's own starter ships with.
//
// Nothing imports this. It exists for the editor and for anyone running tsc
// over the project, and it has no effect on the build, which never sees it.
