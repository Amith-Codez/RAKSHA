import { useId } from 'react';

/** RAKSHA mark: a shield wearing a rakhi. A rakhi is the thread of protection tied for family in India;
 *  the marigold rosette holds a check, the "verified safe" sign. Full art from 40 px, a simpler mark below. */
export function Shield({ size = 28, className = '' }: { size?: number; className?: string }) {
  const u = useId().replace(/:/g, '');
  if (size < 40) return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} aria-hidden="true">
<defs>
  <linearGradient id={`${u}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2A1A8C"/><stop offset=".55" stopColor="#6D4AFF"/><stop offset="1" stopColor="#C063FF"/></linearGradient>
  <radialGradient id={`${u}glow`} cx=".28" cy=".18" r=".75"><stop offset="0" stopColor="#fff" stopOpacity=".38"/><stop offset=".7" stopColor="#fff" stopOpacity="0"/></radialGradient>
  <linearGradient id={`${u}sh`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFDF8"/><stop offset="1" stopColor="#FFE2B0"/></linearGradient>
  <linearGradient id={`${u}pet`} x1="0" y1="-1" x2="0" y2="0"><stop offset="0" stopColor="#FFD24A"/><stop offset="1" stopColor="#FF8A1F"/></linearGradient>
  <radialGradient id={`${u}core`} cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#9A7BFF"/><stop offset="1" stopColor="#2A1A8C"/></radialGradient>
</defs>
<rect x="0" y="0" width="128" height="128" rx="30" fill={`url(#${u}bg)`}/>
<path d="M64 12 L106 26 V56 C106 84 88 105 64 116 C40 105 22 84 22 56 V26 Z" fill={`url(#${u}sh)`} stroke="#fff" strokeWidth="4"/>
<circle cx="64" cy="62" r="27" fill="#FF9A1F"/><circle cx="64" cy="62" r="16" fill={`url(#${u}core)`} stroke="#fff" strokeWidth="4"/>
<path d="M56 62.5 L61.5 68 L72 56" stroke="#FFE08A" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>

    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} aria-hidden="true">
<defs>
  <linearGradient id={`${u}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2A1A8C"/><stop offset=".55" stopColor="#6D4AFF"/><stop offset="1" stopColor="#C063FF"/></linearGradient>
  <radialGradient id={`${u}glow`} cx=".28" cy=".18" r=".75"><stop offset="0" stopColor="#fff" stopOpacity=".38"/><stop offset=".7" stopColor="#fff" stopOpacity="0"/></radialGradient>
  <linearGradient id={`${u}sh`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFDF8"/><stop offset="1" stopColor="#FFE2B0"/></linearGradient>
  <linearGradient id={`${u}pet`} x1="0" y1="-1" x2="0" y2="0"><stop offset="0" stopColor="#FFD24A"/><stop offset="1" stopColor="#FF8A1F"/></linearGradient>
  <radialGradient id={`${u}core`} cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#9A7BFF"/><stop offset="1" stopColor="#2A1A8C"/></radialGradient>
</defs>
<rect x="4" y="4" width="120" height="120" rx="34" fill={`url(#${u}bg)`}/>
<rect x="4" y="4" width="120" height="120" rx="34" fill={`url(#${u}glow)`}/>
<rect x="5.5" y="5.5" width="117" height="117" rx="32.5" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5"/>
<path d="M64 17 L101 29.5 V57 C101 82 85 101.5 64 111 C43 101.5 27 82 27 57 V29.5 Z" fill="#140C4A" opacity=".35" transform="translate(0 4.5)"/>
<path d="M64 17 L101 29.5 V57 C101 82 85 101.5 64 111 C43 101.5 27 82 27 57 V29.5 Z" fill={`url(#${u}sh)`} stroke="#fff" strokeWidth="2.6" strokeLinejoin="round"/>
<path d="M31 63 C38 57 44 69 50 62" stroke="#E11D48" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
<path d="M31 67 C38 61 44 73 50 66" stroke="#FFB224" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
<path d="M78 62 C84 69 90 57 97 63" stroke="#E11D48" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
<path d="M78 66 C84 73 90 61 97 67" stroke="#FFB224" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
<g transform="translate(64 63)"><ellipse cx="0" cy="-15" rx="6.6" ry="10.5" transform="rotate(0)" fill={`url(#${u}pet)`} stroke="#C2410C" strokeWidth=".9"/><ellipse cx="0" cy="-15" rx="6.6" ry="10.5" transform="rotate(45)" fill={`url(#${u}pet)`} stroke="#C2410C" strokeWidth=".9"/><ellipse cx="0" cy="-15" rx="6.6" ry="10.5" transform="rotate(90)" fill={`url(#${u}pet)`} stroke="#C2410C" strokeWidth=".9"/><ellipse cx="0" cy="-15" rx="6.6" ry="10.5" transform="rotate(135)" fill={`url(#${u}pet)`} stroke="#C2410C" strokeWidth=".9"/><ellipse cx="0" cy="-15" rx="6.6" ry="10.5" transform="rotate(180)" fill={`url(#${u}pet)`} stroke="#C2410C" strokeWidth=".9"/><ellipse cx="0" cy="-15" rx="6.6" ry="10.5" transform="rotate(225)" fill={`url(#${u}pet)`} stroke="#C2410C" strokeWidth=".9"/><ellipse cx="0" cy="-15" rx="6.6" ry="10.5" transform="rotate(270)" fill={`url(#${u}pet)`} stroke="#C2410C" strokeWidth=".9"/><ellipse cx="0" cy="-15" rx="6.6" ry="10.5" transform="rotate(315)" fill={`url(#${u}pet)`} stroke="#C2410C" strokeWidth=".9"/><ellipse cx="0" cy="-10.5" rx="3.6" ry="6" transform="rotate(22.5)" fill="#E11D48" opacity=".92"/><ellipse cx="0" cy="-10.5" rx="3.6" ry="6" transform="rotate(67.5)" fill="#E11D48" opacity=".92"/><ellipse cx="0" cy="-10.5" rx="3.6" ry="6" transform="rotate(112.5)" fill="#E11D48" opacity=".92"/><ellipse cx="0" cy="-10.5" rx="3.6" ry="6" transform="rotate(157.5)" fill="#E11D48" opacity=".92"/><ellipse cx="0" cy="-10.5" rx="3.6" ry="6" transform="rotate(202.5)" fill="#E11D48" opacity=".92"/><ellipse cx="0" cy="-10.5" rx="3.6" ry="6" transform="rotate(247.5)" fill="#E11D48" opacity=".92"/><ellipse cx="0" cy="-10.5" rx="3.6" ry="6" transform="rotate(292.5)" fill="#E11D48" opacity=".92"/><ellipse cx="0" cy="-10.5" rx="3.6" ry="6" transform="rotate(337.5)" fill="#E11D48" opacity=".92"/>
<circle r="13.2" fill="#FFB224" stroke="#C2410C" strokeWidth=".9"/><circle cx="10.80" cy="0.00" r="1.7" fill="#FFF7E0"/><circle cx="9.35" cy="5.40" r="1.7" fill="#FFF7E0"/><circle cx="5.40" cy="9.35" r="1.7" fill="#FFF7E0"/><circle cx="0.00" cy="10.80" r="1.7" fill="#FFF7E0"/><circle cx="-5.40" cy="9.35" r="1.7" fill="#FFF7E0"/><circle cx="-9.35" cy="5.40" r="1.7" fill="#FFF7E0"/><circle cx="-10.80" cy="0.00" r="1.7" fill="#FFF7E0"/><circle cx="-9.35" cy="-5.40" r="1.7" fill="#FFF7E0"/><circle cx="-5.40" cy="-9.35" r="1.7" fill="#FFF7E0"/><circle cx="-0.00" cy="-10.80" r="1.7" fill="#FFF7E0"/><circle cx="5.40" cy="-9.35" r="1.7" fill="#FFF7E0"/><circle cx="9.35" cy="-5.40" r="1.7" fill="#FFF7E0"/>
<circle r="8.6" fill={`url(#${u}core)`} stroke="#fff" strokeWidth="1.8"/>
<path d="M-4.2 .2 L-1.2 3.3 L4.6 -3.6" stroke="#FFE08A" strokeWidth="2.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
<path d="M103 12 L104.96 17.04 L110 19 L104.96 20.96 L103 26 L101.04 20.96 L96 19 L101.04 17.04Z" fill="#FFE08A" opacity="1"/><path d="M114 30.8 L114.896 33.104 L117.2 34 L114.896 34.896 L114 37.2 L113.104 34.896 L110.8 34 L113.104 33.104Z" fill="#fff" opacity="0.85"/><path d="M19 99.8 L20.176000000000002 102.824 L23.2 104 L20.176000000000002 105.176 L19 108.2 L17.823999999999998 105.176 L14.8 104 L17.823999999999998 102.824Z" fill="#fff" opacity="0.7"/>

    </svg>
  );
}
