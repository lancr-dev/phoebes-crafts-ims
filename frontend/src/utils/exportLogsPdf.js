import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatLogDateTime, logActionLabel } from './logData.js';

export const buildLogsPdf = (logs, { fontBase64, generatedAt = new Date(), boundary } = {}) => {
  if (!fontBase64) throw new Error('The report font is unavailable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', fontBase64);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.setProperties({ title: 'Inventory logs - Phoebe\'s Crafts', subject: 'Stock movement history', creator: 'Phoebe\'s Crafts inventory system' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const generated = formatLogDateTime(generatedAt);
  const cutoff = boundary && formatLogDateTime(boundary.throughCreatedAt);
  const format = new Intl.NumberFormat('en-PH');

  autoTable(doc, {
    head: [['Date & time', 'Material name', 'Action', 'Quantity', 'Before', 'After']],
    body: logs.map((log) => {
      const timestamp = formatLogDateTime(log.createdAt);
      return [`${timestamp.date}\n${timestamp.time}`, log.itemName, logActionLabel(log.actionType),
        format.format(log.quantity), format.format(log.previousStock), format.format(log.newStock)];
    }),
    startY: 59,
    margin: { top: 59, right: 14, bottom: 18, left: 14 },
    theme: 'grid', showHead: 'everyPage', rowPageBreak: 'avoid',
    styles: { font: 'NotoSans', fontStyle: 'normal', fontSize: 8.5, cellPadding: 2.5, textColor: [0, 0, 0], lineColor: [210, 210, 208], lineWidth: 0.15, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fontStyle: 'normal', fillColor: [233, 202, 210], textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [250, 248, 249] },
    columnStyles: { 0: { cellWidth: 43 }, 1: { cellWidth: 76 }, 2: { cellWidth: 30 },
      3: { cellWidth: 40, halign: 'right' }, 4: { cellWidth: 40, halign: 'right' }, 5: { cellWidth: 40, halign: 'right' } },
    willDrawPage: () => {
      doc.setTextColor(0, 0, 0);
      doc.setFont('times', 'italic');
      doc.setFontSize(19);
      doc.text("Phoebe's Crafts", 14, 19);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(14);
      doc.text('Inventory logs', 14, 29);
      doc.setFontSize(8.5);
      doc.setTextColor(75, 75, 75);
      doc.text(`Generated ${generated.date}, ${generated.time} - Manila`, 14, 38);
      doc.text(`${format.format(logs.length)} stock movements - newest first`, 14, 44);
      if (cutoff) doc.text(`History through ${cutoff.date}, ${cutoff.time} - Manila`, 14, 50);
    },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(75, 75, 75);
    doc.text('Times shown in Asia/Manila (UTC+08:00)', 14, height - 9);
    doc.text(`Page ${page} of ${pages}`, width - 14, height - 9, { align: 'right' });
  }
  return doc;
};

export const exportLogsPdf = async (logs, { boundary, signal } = {}) => {
  const response = await fetch(new URL('../assets/NotoSans-Regular.ttf', import.meta.url), { signal });
  if (!response.ok) throw new Error('The report font could not be loaded');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  const generatedAt = new Date();
  const doc = buildLogsPdf(logs, { fontBase64: btoa(chunks.join('')), generatedAt, boundary });
  if (signal?.aborted) return;
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Manila' }).formatToParts(generatedAt);
  const date = ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type).value).join('-');
  await doc.save(`phoebes-inventory-logs-${date}.pdf`, { returnPromise: true });
};
