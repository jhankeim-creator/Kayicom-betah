export const buildPlisioInvoiceUrl = (invoiceUrl, invoiceId) => {
  if (invoiceUrl) return invoiceUrl;
  if (invoiceId) return `https://plisio.net/invoice/${invoiceId}`;
  return null;
};

export const openPlisioInvoice = (invoiceUrl, storageKey) => {
  if (!invoiceUrl || typeof window === 'undefined') return false;
  const key = storageKey ? `plisio_invoice_opened_${storageKey}` : null;
  if (key && window.sessionStorage?.getItem(key)) {
    return false;
  }
  if (key && window.sessionStorage) {
    window.sessionStorage.setItem(key, '1');
  }
  const popup = window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.assign(invoiceUrl);
  }
  return true;
};
