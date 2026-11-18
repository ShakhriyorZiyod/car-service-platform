import { useT } from '../../i18n';
import { StageStub } from '../../ui/StageStub';

/** The client's app: home, garage, booking, orders, profile (stage 3). */
export default function ClientShell() {
  const t = useT();
  return <StageStub title={t.shells.client.title} note={t.shells.client.note} stage={3} />;
}
