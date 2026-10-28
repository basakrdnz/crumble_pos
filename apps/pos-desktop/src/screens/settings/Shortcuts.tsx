export const SHORTCUTS: [string, string][] = [
  ['F12', 'Ödeme penceresini aç / ödemeyi onayla'],
  ['Esc', 'Pencereyi kapat, satır seçimini kaldır; seçim yoksa satışı iptal et'],
  ['F3', 'Yeni hesap (isimle)'],
  ['0–9 , ⌫ Enter', 'Tuş takımı açıkken klavyeden sayı girişi'],
  ['Del', 'Tuş takımını temizle'],
];

export function Shortcuts() {
  return (
    <>
      <h2>Klavye kısayolları</h2>
      <table className="grid" style={{ maxWidth: 640 }} aria-label="Kısayollar">
        <tbody>
          {SHORTCUTS.map(([key, description]) => (
            <tr key={key}>
              <td style={{ width: 160 }}>
                <kbd>{key}</kbd>
              </td>
              <td>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
