import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from './i18n';

type Position = { x: number; y: number };
type DragState = Position & {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  moved: boolean;
};

type Props = {
  onExit: () => void;
};

function clampPosition(x: number, y: number, width: number, height: number, parent: DOMRect | null): Position {
  if (!parent) return { x, y };
  return {
    x: Math.max(8, Math.min(x, Math.max(8, parent.width - width - 8))),
    y: Math.max(8, Math.min(y, Math.max(8, parent.height - height - 8)))
  };
}

export function EmbeddedBrowserExitControl({ onExit }: Props) {
  const { text } = useI18n();
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const parent = event.currentTarget.parentElement?.getBoundingClientRect() ?? null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!parent) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: rect.left - parent.left,
      y: rect.top - parent.top,
      width: rect.width,
      height: rect.height,
      moved: false
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    setPosition(clampPosition(drag.x + deltaX, drag.y + deltaY, drag.width, drag.height, event.currentTarget.parentElement?.getBoundingClientRect() ?? null));
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onExit();
  }

  const style = position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } as CSSProperties : undefined;
  return <button
    className="embedded-browser-exit-control"
    type="button"
    title={text('退出当前页面；可拖动调整位置', 'Exit this page; drag to move')}
    aria-label={text('退出当前页面', 'Exit this page')}
    style={style}
    onPointerDown={beginDrag}
    onPointerMove={moveDrag}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    onClick={handleClick}
  ><ArrowLeft size={17} /><span>{text('退出', 'Exit')}</span></button>;
}
