import { useT } from '../i18n';

/**
 * Stands in for a section that a later stage builds; the route switches to the feature's own
 * page in that stage.
 */
export function ComingSoon({ title, stage }: { title: string; stage: number }) {
  const t = useT();
  return (
    <section>
      <h1 className="page-title">{title}</h1>
      <p className="muted">{t.comingSoon(stage)}</p>
    </section>
  );
}
