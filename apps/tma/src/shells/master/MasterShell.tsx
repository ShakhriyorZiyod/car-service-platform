import { useT } from '../../i18n';
import { StageStub } from '../../ui/StageStub';

/** The master's app: tasks, work and photo reports (stage 5). */
export default function MasterShell() {
  const t = useT();
  return <StageStub title={t.shells.master.title} note={t.shells.master.note} stage={5} />;
}
