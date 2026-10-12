import logo from '../assets/island-resilience.png';
export { logo as islandLogo };
export function IslandLogo({ size = 64, className = '' }) {
  return <img className={`island-logo ${className}`} src={logo} width={size} height={size} alt="MERL Portal — Island resilience" />;
}
export function IslandWave({ className = '' }) {
  return <svg className={`island-wave ${className}`} viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 30C100-20 170 100 300 50S470 0 600 40V100H0Z" fill="#008e9b" opacity=".15"/><path d="M0 65C110 15 175 120 310 75S470 35 600 65V100H0Z" fill="#008e9b" opacity=".2"/></svg>;
}
export function IslandLoading() {
  return <svg className="island-loading" viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" focusable="false"><path d="M24 5a19 19 0 0 1 19 19" fill="none" stroke="#dc6850" strokeWidth="5" strokeLinecap="round"/><path d="M43 24a19 19 0 0 1-19 19" fill="none" stroke="#3d8960" strokeWidth="5" strokeLinecap="round"/><path d="M24 43A19 19 0 0 1 5 24" fill="none" stroke="#008e9b" strokeWidth="5" strokeLinecap="round"/><path d="M5 24A19 19 0 0 1 24 5" fill="none" stroke="#153b58" strokeWidth="5" strokeLinecap="round"/></svg>;
}
export function IslandEmpty() {
  return <svg viewBox="0 0 80 64" width="72" height="58" aria-hidden="true" focusable="false"><path d="M8 52V14a4 4 0 0 1 4-4h19l9 9h28a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4Z" fill="#f1f9fa" stroke="#153b58" strokeWidth="2.5"/><path d="M10 43c12-9 19-9 30-1s21 8 30-1v12H10Z" fill="#008e9b" opacity=".3"/></svg>;
}
