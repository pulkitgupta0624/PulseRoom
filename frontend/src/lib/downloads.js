import { api } from './api';

const parseContentDispositionFileName = (contentDisposition) => {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition || '');
  return match?.[1] || null;
};

const triggerBlobDownload = ({ blob, fileName }) => {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const downloadEventBookingsCsv = async (eventId, fallbackFileName = 'event-bookings.csv') => {
  const response = await api.get(`/api/bookings/event/${eventId}/export.csv`, {
    responseType: 'blob'
  });

  const fileName =
    parseContentDispositionFileName(response.headers['content-disposition']) || fallbackFileName;

  triggerBlobDownload({
    blob: new Blob([response.data], {
      type: response.headers['content-type'] || 'text/csv;charset=utf-8'
    }),
    fileName
  });
};

const downloadTextFile = ({
  content,
  fileName,
  mimeType = 'text/plain;charset=utf-8'
}) => {
  triggerBlobDownload({
    blob: new Blob([content], {
      type: mimeType
    }),
    fileName
  });
};

export { downloadEventBookingsCsv, downloadTextFile };
