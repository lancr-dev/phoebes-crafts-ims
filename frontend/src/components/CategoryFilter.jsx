import { useId, useState } from 'react';
import { Filter } from 'lucide-react';

export default function CategoryFilter({ category, categories, isLoading, error, onChange, onRetry, disabled }) {
  const id = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  // Keep a selected category available even if its last material was removed.
  const options = category && !categories.includes(category) ? [category, ...categories] : categories;

  return (
    <div className="inventory-category-filter">
      <div className="inventory-filter-toolbar">
        <button className={`inventory-button${category ? ' inventory-filter-active' : ''}`} type="button" disabled={disabled}
          aria-expanded={isExpanded} aria-controls={`${id}-panel`} onClick={() => setIsExpanded((current) => !current)}>
          <Filter size={16} aria-hidden="true" />Filter by category
        </button>
        <p className="inventory-filter-selection" role="status">{category ? <>Category: <strong>{category}</strong></> : 'All categories'}</p>
        {category && <button className="inventory-button" type="button" onClick={() => onChange('')} disabled={disabled}>Clear filter</button>}
      </div>
      <div id={`${id}-panel`} className="inventory-category-panel" hidden={!isExpanded}>
        <div className="inventory-category-field">
          <label htmlFor={`${id}-category`}>Category</label>
          <select id={`${id}-category`} value={category} onChange={(event) => onChange(event.target.value)} disabled={disabled || isLoading || Boolean(error)}>
            <option value="">All categories</option>
            {options.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        {isLoading && <p className="inventory-filter-help" role="status">Loading categories…</p>}
        {error ? <div className="inventory-filter-error" role="alert"><p>{error}</p><button className="inventory-button" type="button" onClick={onRetry} disabled={disabled || isLoading}>Retry categories</button></div>
          : !isLoading && <p className="inventory-filter-help">{categories.length === 0 ? 'No categories yet. Add a material to create one.' : 'Choose a category to see its materials across all pages.'}</p>}
      </div>
    </div>
  );
}
