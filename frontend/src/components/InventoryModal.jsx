import { useId, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { validateMaterialForm } from '../utils/inventoryData.js';

export default function InventoryModal({ item, onSave, onClose, isPending, error, isSubmitDisabled }) {
  const isEditing = Boolean(item);
  const id = useId();
  const formRef = useRef(null);
  const [values, setValues] = useState({ itemName: item?.itemName ?? '', category: item?.category ?? '', stock: '0' });
  const [errors, setErrors] = useState({});

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isPending || isSubmitDisabled) return;
    const result = validateMaterialForm(values, isEditing);
    setErrors(result.errors);
    const invalidField = Object.keys(result.errors)[0];
    if (invalidField) { formRef.current.elements.namedItem(invalidField).focus(); return; }
    onSave(result.input);
  };

  return (
    <Modal title={isEditing ? 'Edit material' : 'Add new material'} titleId={`${id}-title`} onClose={onClose} isPending={isPending}>
      <p className="inventory-dialog-description">{isEditing ? 'Update the material details. Use the stock controls to change quantities.' : 'Give your material a name, category, and starting stock.'}</p>
      <form ref={formRef} onSubmit={handleSubmit} noValidate aria-busy={isPending}>
        <div className="inventory-form-fields">
          {[
            { name: 'itemName', label: 'Material name', type: 'text' },
            { name: 'category', label: 'Category', type: 'text' },
            ...(!isEditing ? [{ name: 'stock', label: 'Initial stock', type: 'number' }] : []),
          ].map(({ name, label, type }) => (
            <div className="inventory-form-field" key={name}>
              <label htmlFor={`${id}-${name}`}>{label}</label>
              <input id={`${id}-${name}`} name={name} type={type} required value={values[name]}
                min={type === 'number' ? 0 : undefined} max={type === 'number' ? Number.MAX_SAFE_INTEGER : undefined}
                step={type === 'number' ? 1 : undefined} inputMode={type === 'number' ? 'numeric' : undefined}
                autoComplete="off" disabled={isPending} aria-invalid={Boolean(errors[name])}
                aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
                onChange={(event) => { setValues({ ...values, [name]: event.target.value }); setErrors({ ...errors, [name]: '' }); }} />
              {errors[name] && <p id={`${id}-${name}-error`} className="inventory-field-error">{errors[name]}</p>}
            </div>
          ))}
        </div>
        {error && <p className="inventory-dialog-error" role="alert">{error}</p>}
        <footer className="inventory-dialog-actions">
          <button className="inventory-button" type="button" onClick={onClose} disabled={isPending}>Cancel</button>
          <button className="inventory-button inventory-button-primary" type="submit" disabled={isPending || isSubmitDisabled}>
            {isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Add material'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
