function styleSheetHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7A3B00' }
  };
}

function styleTableHeader(row) {
  row.font = { bold: true, color: { argb: 'FF0F172A' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3E8D6' }
  };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
}

function styleKeyValueCell(cell, bold = false) {
  cell.font = { bold, color: { argb: 'FF1F2937' } };
  cell.alignment = { vertical: 'middle' };
}

function styleSectionNote(cell) {
  cell.alignment = { wrapText: true, vertical: 'top' };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF7ED' }
  };
  cell.font = { color: { argb: 'FF7C2D12' } };
}

function formatDateLabel(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

module.exports = {
  formatDateLabel,
  styleKeyValueCell,
  styleSectionNote,
  styleSheetHeader,
  styleTableHeader
};
