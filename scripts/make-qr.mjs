// Crea public/qr-scarica.svg: il QR code della pagina di download, mostrato nella finestra ℹ️.
// Il link non cambia mai, quindi il file si genera una volta sola: npm run qr
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';

const URL_DOWNLOAD = 'https://github.com/Nikcirri/lupus/releases/latest';

const svg = await QRCode.toString(URL_DOWNLOAD, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#10142A', light: '#FBF6E6' }
});
writeFileSync(new URL('../public/qr-scarica.svg', import.meta.url), svg);
console.log('QR creato per', URL_DOWNLOAD);
