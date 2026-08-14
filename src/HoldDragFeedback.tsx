import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsUpDown, Minus, Plus } from 'lucide-react';

export function HoldDragFeedback({ vertical = false, wheel = false }: { vertical?: boolean; wheel?: boolean }) {
  return (
    <span className={`hold-drag-feedback ${vertical ? 'with-vertical' : ''} ${wheel ? 'with-wheel' : ''}`} aria-hidden="true">
      <span className="hold-drag-hint horizontal left"><ArrowLeft size={25} strokeWidth={3.6} /><Minus size={21} strokeWidth={3.6} /></span>
      <span className="hold-drag-hint horizontal right"><Plus size={21} strokeWidth={3.6} /><ArrowRight size={25} strokeWidth={3.6} /></span>
      {vertical && <>
        <span className="hold-drag-hint vertical up"><ArrowUp size={25} strokeWidth={3.6} /></span>
        <span className="hold-drag-hint vertical down"><ArrowDown size={25} strokeWidth={3.6} /></span>
      </>}
      {wheel && <span className="hold-drag-wheel-hint">
        <Plus className="wheel-sign plus" size={15} strokeWidth={3.6} />
        <ChevronsUpDown className="wheel-axis" size={37} strokeWidth={3.2} />
        <Minus className="wheel-sign minus" size={15} strokeWidth={3.6} />
      </span>}
      <svg className="hold-reset-progress" viewBox="0 0 20 20">
        <circle className="track" cx="10" cy="10" r="7" />
        <circle className="value" cx="10" cy="10" r="7" pathLength="1" />
      </svg>
    </span>
  );
}
