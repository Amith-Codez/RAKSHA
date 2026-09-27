export function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex gap-2" role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`flex-1 rounded-xl border-2 py-2.5 text-lg font-semibold ${value === v ? 'border-violet bg-violet text-white' : 'border-line bg-white'}`}>{l}</button>
      ))}
    </div>
  );
}
