// Hesap dökümünü / raporu paylaş (2026-11-23): the page becomes a PDF with a
// readable file name and goes to the phone's share sheet (WhatsApp, Mail…).
// On the web (tests) the page opens in a new tab instead.
//
// The native modules are loaded only when sharing, never at start-up
// (2026-11-23: the app stopped opening after they were added; whatever the
// cause, a share problem must not keep the whole app from starting).
import { Platform } from 'react-native';

export async function sharePdf(html: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
    return;
  }
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html });
  let target = uri;
  try {
    // A readable name ("Cimnastik-hesap-dokumu-2026-11-23.pdf") when the file API is there.
    const { File, Paths } = await import('expo-file-system');
    const named = new File(Paths.cache, `${fileName}.pdf`);
    if (named.exists) named.delete();
    new File(uri).move(named);
    target = named.uri;
  } catch {
    // Keep the generated name.
  }
  await Sharing.shareAsync(target, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Paylaş' });
}
