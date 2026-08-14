export function roundedTextOutlineShadow(
  enabled: boolean,
  width: number,
  color: string,
  extraShadows: string[] = []
): string | undefined {
  const radius = Math.max(0, Number(width) || 0);
  if (!enabled || radius <= 0) return extraShadows.length ? extraShadows.join(', ') : undefined;

  const samples = radius >= 3 ? 16 : 12;
  const outline = Array.from({ length: samples }, (_, index) => {
    const angle = (Math.PI * 2 * index) / samples;
    const x = cleanOffset(Math.cos(angle) * radius);
    const y = cleanOffset(Math.sin(angle) * radius);
    return `${x}px ${y}px 0 ${color}`;
  });
  return [...outline, ...extraShadows].join(', ');
}

function cleanOffset(value: number): number {
  if (Math.abs(value) < 0.005) return 0;
  return Number(value.toFixed(2));
}
