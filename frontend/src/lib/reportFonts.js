import regularUrl from '../assets/report-fonts/ReportSans-Regular.ttf?url';
import boldUrl from '../assets/report-fonts/ReportSans-Bold.ttf?url';
let cachedFonts;
export async function loadReportFonts(pdf) {
  if (!cachedFonts) cachedFonts = Promise.all([regularUrl, boldUrl].map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('The report fonts could not be loaded. Please retry.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return btoa(binary);
  })).catch(error => { cachedFonts = null; throw error; });
  const fonts = await cachedFonts;
  fonts.forEach((font, index) => {
    const filename = index ? 'ReportSans-Bold.ttf' : 'ReportSans-Regular.ttf';
    pdf.addFileToVFS(filename, font);
    pdf.addFont(filename, 'ReportSans', index ? 'bold' : 'normal');
  });
}
