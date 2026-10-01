import { useId, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { validateAdjustment } from '../utils/inventoryData.js';
import '../styles/stock-adjustment-modal.css';

export default function StockAdjustmentModal({ item, direction, onSave, onClose, isPending, error, isSubmitDisabled }) {
  const id = useId();
  const inputRef = useRef(null);
  const [quantity, setQuantity] = useState('1');
  const [validationError, setValidationError] = useState('');
  const isIncrease = direction === 'increase';

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isPending || isSubmitDisabled) return;
    const message = validateAdjustment(quantity, item, direction);
    setValidationError(message);
    if (message) { inputRef.current.focus(); return; }
    onSave(Number(quantity));
  };

  return (
    <Modal title={isIncrease ? 'Increase stock' : 'Decrease stock'} titleId={`${id}-title`} onClose={onClose} isPending={isPending}>
      <p className="inventory-dialog-description stock-material-name">{item.itemName}</p>
      <p className="stock-current">Current stock: <strong>{new Intl.NumberFormat('en-PH').format(item.stock)}</strong></p>
      <form onSubmit={handleSubmit} noValidate aria-busy={isPending}>
        <div className="inventory-form-field">
          <label htmlFor={`${id}-quantity`}>Quantity to {direction}</label>
          <input ref={inputRef} id={`${id}-quantity`} name="quantity" type="number" inputMode="numeric" min="1" step="1"
            max={isIncrease ? Number.MAX_SAFE_INTEGER - item.stock : item.stock} required value={quantity} disabled={isPending}
            aria-invalid={Boolean(validationError)} aria-describedby={`${id}-help${validationError ? ` ${id}-error` : ''}`}
            onChange={(event) => { setQuantity(event.target.value); setValidationError(''); }} />
          <p id={`${id}-help`} className="inventory-field-help">Enter a whole number. Stock status updates automatically.</p>
          {validationError && <p id={`${id}-error`} className="inventory-field-error">{validationError}</p>}
        </div>
        {error && <p className="inventory-dialog-error" role="alert">{error}</p>}
        <footer className="inventory-dialog-actions">
          <button className="inventory-button" type="button" onClick={onClose} disabled={isPending}>Cancel</button>
          <button className="inventory-button inventory-button-primary" type="submit" disabled={isPending || isSubmitDisabled}>
            {isPending ? 'Saving…' : isIncrease ? 'Increase stock' : 'Decrease stock'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
