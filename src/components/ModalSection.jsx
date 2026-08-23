import { sectionHeading } from '../lib/controlStyles'

// One part of a dialog.
//
// Dialogs have grown. Adding somebody now asks for their name, their pay, their
// dates, their right to work and their food safety training, and as one long run
// of fields that is a wall rather than a form.
//
// The divider runs the full width of the dialog rather than sitting inside the
// padding, which is what the older screens in this project already do and is the
// thing that was missing. A rule that stops short of both edges reads as a line
// somebody drew under some text. One that reaches the edges reads as the dialog
// being in parts.
//
// No border on the first one, so a dialog does not open with a rule directly
// under its own heading bar.
export default function ModalSection({ title, children, className = '' }) {
    return (
        <div className={`px-6 py-4 border-t border-border first:border-t-0 ${className}`}>
            {title && <h3 className={sectionHeading}>{title}</h3>}
            {children}
        </div>
    )
}
