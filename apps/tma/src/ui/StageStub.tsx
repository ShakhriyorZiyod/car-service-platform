import { useT } from '../i18n';
import './StageStub.css';

/**
 * Stands in for a part of the app that a later stage builds. It disappears from a shell as soon
 * as the shell gets its first real screen.
 */
export function StageStub({ title, note, stage }: { title: string; note: string; stage: number }) {
  const t = useT();
  return (
    <main className="stage-stub">
      <section className="stage-stub__card">
        <p className="caption stage-stub__label">CarService</p>
        <h1 className="title-xl">{title}</h1>
        <p className="secondary">{note}</p>
        <p className="num-xl stage-stub__stage">{t.stage(stage)}</p>
      </section>
    </main>
  );
}
