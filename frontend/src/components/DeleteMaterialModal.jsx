import { useId } from 'react';
import Modal from './Modal.jsx';

export default function DeleteMaterialModal({ item, onConfirm, onClose, isPending, error, isSubmitDisabled }) {
  const id = useId();
  return (
    <Modal title="Delete material?" titleId={`${id}-title`} onClose={onClose} isPending={isPending}>
      <p className="inventory-dialog-description">Delete <strong>{item.itemName}</strong> from inventory? This cannot be undone. Existing stock history is retained.</p>
      {error && <p className="inventory-dialog-error" role="alert">{error}</p>}
      <footer className="inventory-dialog-actions" aria-busy={isPending}>
        <button className="inventory-button" type="button" onClick={onClose} disabled={isPending}>Cancel</button>
        <button className="inventory-button inventory-button-danger" type="button" onClick={onConfirm} disabled={isPending || isSubmitDisabled}>
          {isPending ? 'Deleting…' : 'Delete material'}
        </button>
      </footer>
    </Modal>
  );
}
