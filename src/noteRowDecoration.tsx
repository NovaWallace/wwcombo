import type { CSSProperties } from 'react';
import type { CharacterSlot, ComboImageStyle, ComboStep } from '../combo-core';
import { comboTextParts, defaultComboContentLabelForMoveId, effectiveIconMappings, normalizeRectPercent } from './combo-image/comboImage';
import type { ComboContentPart } from './combo-image/comboImage';
import './noteRowDecoration.css';

export type NoteOperationIcon = Extract<ComboContentPart, { kind: 'icon' }>;

export function noteOperationIcon(step: ComboStep, style: ComboImageStyle): NoteOperationIcon | null {
  const slot = (step.characterSlot ?? 1) as CharacterSlot;
  const value = defaultComboContentLabelForMoveId(step.moveId)
    ?? style.contentLabels[step.id]?.trim()
    ?? step.label;
  const part = comboTextParts(value, true, effectiveIconMappings(style, slot)).find((candidate) => candidate.kind === 'icon');
  return part?.kind === 'icon' ? part : null;
}

export function DecoratedNoteRow({ step, style, className, scale = 1, number }: { step: ComboStep; style: ComboImageStyle; className: string; scale?: number; number?: number }) {
  const slot = (step.characterSlot ?? 1) as CharacterSlot;
  const role = style.roleStyles[slot];
  const icon = noteOperationIcon(step, style);
  const visualScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const strokeSpace = style.noteTextStrokeEnabled ? (Math.ceil(Math.max(0, style.noteTextStrokeWidth) * visualScale) + visualScale) : visualScale;
  const crop = normalizeRectPercent(role.avatarCrop, { x: 0, y: 0, w: 100, h: 100 });
  const avatarStyle = role.avatar ? {
    backgroundImage: `url(${role.avatar})`,
    backgroundSize: `${10000 / crop.w}% ${10000 / crop.h}%`,
    backgroundPosition: `${crop.x <= 0 ? 0 : (crop.x / Math.max(1, 100 - crop.w)) * 100}% ${crop.y <= 0 ? 0 : (crop.y / Math.max(1, 100 - crop.h)) * 100}%`,
    backgroundRepeat: 'no-repeat',
    borderColor: role.color
  } : { backgroundColor: role.color, borderColor: role.color };
  return <div className={`${className} decorated-note-row`} style={{ '--note-outline-space': `${strokeSpace}px` } as CSSProperties}>
    <span className="decorated-note-avatar" style={avatarStyle} aria-hidden="true">{role.avatar ? null : slot}</span>
    <span className="decorated-note-operation" style={{ '--note-operation-width-scale': icon?.iconWidthScale ?? 1 } as CSSProperties} aria-hidden="true">
      {icon && <img src={icon.src} alt="" />}
    </span>
    {number !== undefined && <span className="decorated-note-number" aria-label={`Note ${number}`}>{number}</span>}
    <span className="decorated-note-diamond-slot" aria-hidden="true"><span className="decorated-note-diamond" /></span>
    <span className="decorated-note-text">{step.note?.trim()}</span>
  </div>;
}
