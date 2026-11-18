import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { hoursMinutes } from '../lib/master-time';

/**
 * "0:42 / me'yor 1:00" (design U1). The server counts the seconds worked at the moment of its
 * answer; the phone only adds the time that has passed since, by its own stopwatch and not by its
 * date. A fresh answer replaces the count: mount this with a key that changes with it.
 */
export function MasterTimer({
  elapsedSec,
  normMinutes,
}: {
  elapsedSec: number;
  normMinutes: number;
}) {
  const t = useT().master;
  const [started] = useState(() => performance.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = elapsedSec + Math.floor((now - started) / 1000);
  return (
    <span className="num master-timer">
      {t.timer(hoursMinutes(seconds / 60), hoursMinutes(normMinutes))}
    </span>
  );
}
