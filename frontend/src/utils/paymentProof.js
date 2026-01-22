export const MAX_INLINE_PROOF_BYTES = 4000000;

export const isInlineImage = (url) => typeof url === 'string' && url.startsWith('data:image');

export const getInlineImageBytes = (url) => {
  if (!isInlineImage(url)) return 0;
  const commaIndex = url.indexOf(',');
  if (commaIndex === -1) return 0;
  const base64Length = url.length - commaIndex - 1;
  return Math.floor((base64Length * 3) / 4);
};

export const canPreviewInlineImage = (url, maxBytes = MAX_INLINE_PROOF_BYTES) => {
  const bytes = getInlineImageBytes(url);
  return bytes > 0 && bytes <= maxBytes;
};

export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
};

export const dataUrlToBlob = (url) => {
  if (!isInlineImage(url)) return null;
  const commaIndex = url.indexOf(',');
  if (commaIndex === -1) return null;
  const meta = url.slice(0, commaIndex);
  const data = url.slice(commaIndex + 1);
  const isBase64 = meta.includes(';base64');
  const mime = meta.split(':')[1]?.split(';')[0] || 'application/octet-stream';
  const byteString = isBase64 ? atob(data) : decodeURIComponent(data);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
};

export const openInlineImage = (url, options = {}) => {
  const { filename = 'payment-proof.png', action = 'open' } = options;
  const blob = dataUrlToBlob(url);
  if (!blob) return false;
  const objectUrl = URL.createObjectURL(blob);

  if (action === 'download') {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener';
    link.click();
  } else {
    const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.rel = 'noopener';
      link.click();
    }
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return true;
};

export const openPaymentProof = (url, options = {}) => {
  if (!url) return false;
  if (isInlineImage(url)) {
    return openInlineImage(url, options);
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
};
