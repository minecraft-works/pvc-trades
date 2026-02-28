/**
 * Dialog utility functions
 * 
 * Shared helpers for dialog management including backdrop close handling.
 * 
 * @module dialogs/dialog-utils
 */

// ============================================================================
// Dialog Backdrop Close
// ============================================================================

/**
 * Set up a dialog to close when clicking on backdrop (outside the dialog box).
 * Only closes if both mousedown and mouseup happen outside the dialog,
 * preventing accidental closes when panning a map and releasing outside.
 * @param dialog - The dialog element to configure for backdrop-close behavior
 */
export function setupDialogBackdropClose(dialog: HTMLDialogElement): void {
    let mouseDownOutside = false;
    
    const isOutsideDialog = (event: MouseEvent): boolean => {
        const rect = dialog.getBoundingClientRect();
        return (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
        );
    };
    
    dialog.addEventListener('mousedown', event => {
        mouseDownOutside = isOutsideDialog(event);
    });
    
    dialog.addEventListener('click', event => {
        if (mouseDownOutside && isOutsideDialog(event)) {
            dialog.close();
        }
        mouseDownOutside = false;
    });
}

// ============================================================================
// Dialog Open Helper
// ============================================================================

/**
 * Open a dialog with optional content preparation callback.
 * 
 * @param dialogId - The ID of the dialog element (without #)
 * @param prepare - Optional callback to prepare content before showing
 */
export function openDialog(dialogId: string, prepare?: () => void): void {
    const dialog = document.querySelector<HTMLDialogElement>(`#${dialogId}`);
    if (!dialog) {
        return;
    }
    
    if (prepare) {
        prepare();
    }
    dialog.showModal();
}
