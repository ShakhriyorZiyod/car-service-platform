import type { Bootstrap } from '@cs/shared';
import { ROLE_LABELS } from '@cs/shared/i18n';
import { ExternalLink, Monitor } from 'lucide-react';
import { useEffect } from 'react';
import { useLang, useT } from '../../i18n';
import { openPanel, panelOpensHere } from '../../telegram';
import { Button } from '../../ui/Button';
import { FullScreenMessage } from '../../ui/FullScreenMessage';
import { Notice } from '../../ui/Notice';

/**
 * Admins, directors and owners work in the web panel (docs/PLAN.md, section 4.7). In Telegram's own
 * apps the panel opens at once in this window: its "Bugun" with a session, its sign-in without one
 * (PLAN 22, 2026-11-20). In Telegram Web a new tab cannot open by itself, so there they learn their
 * role and get the button. Their bot messages, such as sign-in codes, arrive in this chat.
 */
export default function StaffShell({ bootstrap }: { bootstrap: Bootstrap }) {
  const t = useT().shells.staff;
  const lang = useLang();
  // Inside a sentence the role is a common noun: "Siz egasi sifatida…".
  const roles = bootstrap.roles
    .map((role) => ROLE_LABELS[lang][role].toLocaleLowerCase(lang))
    .join(', ');
  const panel = bootstrap.links.admin;
  const goStraight = panel !== null && panelOpensHere();

  useEffect(() => {
    if (goStraight && panel) openPanel(panel);
  }, [goStraight, panel]);

  if (goStraight) {
    return <FullScreenMessage icon={<Monitor size={44} strokeWidth={1.6} />} title={t.opening} />;
  }

  return (
    <FullScreenMessage
      icon={<Monitor size={44} strokeWidth={1.6} />}
      title={t.greeting(bootstrap.user.fullName)}
      action={
        panel ? (
          <Button
            icon={<ExternalLink size={20} aria-hidden="true" />}
            onClick={() => openPanel(panel)}
          >
            {t.openPanel}
          </Button>
        ) : (
          <Notice tone="warning">{t.noPanel}</Notice>
        )
      }
    >
      <p className="secondary">
        {t.youAre(roles)} {t.panelHint}
      </p>
    </FullScreenMessage>
  );
}
