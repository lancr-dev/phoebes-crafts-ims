import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatLogDateTime, logActionLabel } from '../utils/logData.js';
import '../styles/logs-table.css';

const format = new Intl.NumberFormat('en-PH');

export default function LogsTable({ logs }) {
  return (
    <table className="logs-table" role="table">
      <caption className="visually-hidden">Inventory stock movements, newest first. Dates and times shown in Manila time.</caption>
      <thead role="rowgroup">
        <tr role="row">
          {['Date & time', 'Material name', 'Action', 'Quantity', 'Before', 'After'].map((label) => <th key={label} scope="col" role="columnheader">{label}</th>)}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {logs.map((log) => {
          const timestamp = formatLogDateTime(log.createdAt);
          const Icon = log.actionType === 'ADD' ? ArrowDownLeft : ArrowUpRight;
          return (
            <tr key={log._id} role="row" className="logs-row">
              <td role="cell" className="logs-timestamp"><time dateTime={log.createdAt}>{timestamp.date}<span>{timestamp.time}</span></time></td>
              <th scope="row" role="rowheader" className="logs-material-name">{log.itemName}</th>
              <td role="cell" className="logs-action"><span className={`logs-action-label logs-action-${log.actionType.toLowerCase()}`}><Icon size={15} aria-hidden="true" />{logActionLabel(log.actionType)}</span></td>
              <td role="cell" className="logs-quantity"><span className="logs-mobile-label" aria-hidden="true">Quantity</span>{format.format(log.quantity)}</td>
              <td role="cell" className="logs-before"><span className="logs-mobile-label" aria-hidden="true">Before</span>{format.format(log.previousStock)}</td>
              <td role="cell" className="logs-after"><span className="logs-mobile-label" aria-hidden="true">After</span>{format.format(log.newStock)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
