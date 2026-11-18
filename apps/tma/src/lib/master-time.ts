/** Working time as hours and minutes: 150 → "2:30", the way the design shows the timer. */
export function hoursMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}
