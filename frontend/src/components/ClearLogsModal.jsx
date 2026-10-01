import { useId } from 'react';
import Modal from './Modal.jsx';

export default function ClearLogsModal({ totalLogs, onClose, onConfirm, isPending, error }) {
  const id = useId();
  return (
    <Modal title="Clear inventory logs?" titleId={`${id}-title`} onClose={onClose} isPending={isPending}>
      <p className="inventory-dialog-description">Clear {new Intl.NumberFormat('en-PH').format(totalLogs)} stock movement records from the captured history? This cannot be undone. Your materials and stock quantities stay unchanged. Newer records are kept.</p>
      <p className="inventory-dialog-description">Download a PDF first if you need a copy.</p>
      {error && <p className="inventory-dialog-error" role="alert">{error}</p>}
      <footer className="inventory-dialog-actions" aria-busy={isPending}>
        <button className="inventory-button" type="button" onClick={onClose} disabled={isPending}>Cancel</button>
        <button className="inventory-button inventory-button-danger" type="button" onClick={onConfirm} disabled={isPending || Boolean(error)}>
          {isPending ? 'Clearing…' : 'Clear logs'}
        </button>
      </footer>
    </Modal>
  );
}
