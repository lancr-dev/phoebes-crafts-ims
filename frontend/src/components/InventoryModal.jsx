import { useId, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { validateMaterialForm } from '../utils/inventoryData.js';
import { MAX_MATERIAL_TEXT_LENGTH, MAX_STOCK } from '../../../shared/inputValidation.mjs';

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
            { name: 'itemName', label: 'Material name' },
            { name: 'category', label: 'Category' },
            ...(!isEditing ? [{ name: 'stock', label: 'Initial stock' }] : []),
          ].map(({ name, label }) => (
            <div className="inventory-form-field" key={name}>
              <label htmlFor={`${id}-${name}`}>{label}</label>
              <input id={`${id}-${name}`} name={name} type="text" required value={values[name]}
                maxLength={name !== 'stock' ? MAX_MATERIAL_TEXT_LENGTH : undefined}
                inputMode={name === 'stock' ? 'numeric' : undefined} pattern={name === 'stock' ? '[0-9]*' : undefined}
                autoComplete="off" disabled={isPending} aria-invalid={Boolean(errors[name])}
                aria-describedby={`${id}-${name}-help${errors[name] ? ` ${id}-${name}-error` : ''}`}
                onChange={(event) => { setValues((current) => ({ ...current, [name]: event.target.value })); setErrors((current) => ({ ...current, [name]: '' })); }}
                onBlur={() => { setErrors((current) => ({ ...current, [name]: validateMaterialForm(values, isEditing).errors[name] ?? '' })); }} />
              <p id={`${id}-${name}-help`} className="inventory-field-help">
                {name === 'stock' ? `Whole numbers from 0 to ${MAX_STOCK.toLocaleString('en-PH')}. Use digits without commas or decimals.`
                  : <>Maximum {MAX_MATERIAL_TEXT_LENGTH} characters. <span aria-hidden="true">{values[name].length}/{MAX_MATERIAL_TEXT_LENGTH}</span></>}
              </p>
              {errors[name] && <p id={`${id}-${name}-error`} className="inventory-field-error" role="alert">{errors[name]}</p>}
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
