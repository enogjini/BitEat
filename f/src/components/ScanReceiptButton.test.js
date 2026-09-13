import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScanReceiptButton from './ScanReceiptButton';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { upload: jest.fn() },
}));

function choosePhoto() {
  const input = screen.getByLabelText(/skano faturën/i);
  const file = new File(['x'], 'fatura.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

test('uploads the photo and reports what matched', async () => {
  api.upload.mockResolvedValue({
    success: true,
    porosi_id: 200,
    u_krijua: false,
    artikujt: [{ artikull_id: 2, sasia: 2, emri: 'Birrë', cmimi: 250 }],
    tekst_pa_perputhje: [],
  });
  const onChanged = jest.fn().mockResolvedValue();

  render(<ScanReceiptButton tavolineId={3} onChanged={onChanged} />);
  choosePhoto();

  await waitFor(() => expect(api.upload).toHaveBeenCalledWith('/api/tavolinat/3/skano-faturen', expect.any(FormData)));
  await waitFor(() => expect(screen.getByText(/Birrë/)).toBeInTheDocument());
  expect(onChanged).toHaveBeenCalled();
});

test('reports unmatched lines without refreshing the order', async () => {
  api.upload.mockResolvedValue({
    success: true,
    porosi_id: null,
    u_krijua: false,
    artikujt: [],
    tekst_pa_perputhje: [{ rawLine: 'asdkjaslkdj' }],
  });
  const onChanged = jest.fn();

  render(<ScanReceiptButton tavolineId={3} onChanged={onChanged} />);
  choosePhoto();

  await waitFor(() => expect(screen.getByText(/asdkjaslkdj/)).toBeInTheDocument());
  expect(onChanged).not.toHaveBeenCalled();
});

test('shows the error message when the upload fails', async () => {
  api.upload.mockRejectedValue(new Error('Kërkesa është shumë e madhe'));

  render(<ScanReceiptButton tavolineId={3} onChanged={jest.fn()} />);
  choosePhoto();

  await waitFor(() => expect(screen.getByText(/shumë e madhe/)).toBeInTheDocument());
});
