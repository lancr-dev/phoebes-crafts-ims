import { useId, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { validateAdjustment } from '../utils/inventoryData.js';
import { MAX_STOCK } from '../../../shared/inputValidation.mjs';
import '../styles/stock-adjustment-modal.css';

export default function StockAdjustmentModal({ item, direction, onSave, onClose, isPending, error, isSubmitDisabled }) {
  const id = useId();
  const inputRef = useRef(null);
  const [quantity, setQuantity] = useState('1');
  const [validationError, setValidationError] = useState('');
  const isIncrease = direction === 'increase';
  const availableQuantity = Math.max(0, Math.min(MAX_STOCK, isIncrease ? MAX_STOCK - item.stock : item.stock));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isPending || isSubmitDisabled || availableQuantity === 0) return;
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
          <input ref={inputRef} id={`${id}-quantity`} name="quantity" type="text" inputMode="numeric" pattern="[0-9]*"
            required value={quantity} disabled={isPending || availableQuantity === 0} autoComplete="off"
            aria-invalid={Boolean(validationError)} aria-describedby={`${id}-help${validationError ? ` ${id}-error` : ''}`}
            onChange={(event) => { setQuantity(event.target.value); setValidationError(''); }}
            onBlur={() => setValidationError(validateAdjustment(quantity, item, direction))} />
          <p id={`${id}-help`} className="inventory-field-help">
            {availableQuantity > 0 ? `Enter 1 to ${availableQuantity.toLocaleString('en-PH')} units using digits without commas or decimals. Stock status updates automatically.`
              : isIncrease ? `Stock is at the ${MAX_STOCK.toLocaleString('en-PH')} unit limit.` : 'There is no stock to decrease.'}
          </p>
          {validationError && <p id={`${id}-error`} className="inventory-field-error" role="alert">{validationError}</p>}
        </div>
        {error && <p className="inventory-dialog-error" role="alert">{error}</p>}
        <footer className="inventory-dialog-actions">
          <button className="inventory-button" type="button" onClick={onClose} disabled={isPending}>Cancel</button>
          <button className="inventory-button inventory-button-primary" type="submit" disabled={isPending || isSubmitDisabled || availableQuantity === 0}>
            {isPending ? 'Saving…' : isIncrease ? 'Increase stock' : 'Decrease stock'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
