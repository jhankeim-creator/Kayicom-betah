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
