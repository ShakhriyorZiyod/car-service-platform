import type { Bootstrap } from '@cs/shared';
import { ROLE_LABELS } from '@cs/shared/i18n';
import { ExternalLink, Monitor } from 'lucide-react';
import { useLang, useT } from '../../i18n';
import { openExternal } from '../../telegram';
import { Button } from '../../ui/Button';
import { FullScreenMessage } from '../../ui/FullScreenMessage';
import { Notice } from '../../ui/Notice';

/**
 * Admins, directors and owners work in the web panel; here they learn their role and get the link
 * (docs/PLAN.md, section 4.7). Their bot messages, such as sign-in codes, arrive in this chat.
 */
export default function StaffShell({ bootstrap }: { bootstrap: Bootstrap }) {
  const t = useT().shells.staff;
  const lang = useLang();
  // Inside a sentence the role is a common noun: "Siz egasi sifatida…".
  const roles = bootstrap.roles
    .map((role) => ROLE_LABELS[lang][role].toLocaleLowerCase(lang))
    .join(', ');
  const panel = bootstrap.links.admin;

  return (
    <FullScreenMessage
      icon={<Monitor size={44} strokeWidth={1.6} />}
      title={t.greeting(bootstrap.user.fullName)}
      action={
        panel ? (
          <Button
            icon={<ExternalLink size={20} aria-hidden="true" />}
            onClick={() => openExternal(panel)}
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
