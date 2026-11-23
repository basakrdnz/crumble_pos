// Hesap dökümünü paylaş (2026-11-23): the statement page becomes a PDF with a
// readable file name and goes to the phone's share sheet (WhatsApp, Mail…).
// On the web (tests) the page opens in a new tab instead.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function sharePdf(html: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, `${fileName}.pdf`);
  if (target.exists) target.delete();
  new File(uri).move(target);
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Hesap dökümü' });
}
