import { useState } from 'react';
import { api } from '../lib/api';

const InvoiceDownloadButton = ({ booking }) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  if (!booking?.invoice?.invoiceNumber) {
    return null;
  }

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);

    try {
      const response = await api.get(`/api/bookings/${booking._id}/invoice.pdf`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${booking.invoice.invoiceNumber}.pdf`;
      link.click();
      window.URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError.response?.data?.message || 'Invoice download failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="rounded-full border border-reef/20 bg-reef/5 px-4 py-2 text-sm font-medium text-reef transition hover:bg-reef/10 disabled:opacity-50"
      >
        {downloading ? 'Preparing invoice...' : 'Download invoice'}
      </button>
      {error && <p className="text-xs text-ember">{error}</p>}
    </div>
  );
};

export default InvoiceDownloadButton;
