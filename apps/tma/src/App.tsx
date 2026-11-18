import type { Bootstrap } from '@cs/shared';
import type { Lang } from '@cs/shared/i18n';
import type { Shell } from '@cs/shared/vocabulary';
import { Smartphone, WifiOff } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';
import { ApiRequestError } from './api';
import { SessionProvider, useBootstrap } from './bootstrap';
import { I18nProvider, useT } from './i18n';
import { Onboarding } from './onboarding/Onboarding';
import { Button } from './ui/Button';
import { FullScreenMessage } from './ui/FullScreenMessage';

type ShellProps = { bootstrap: Bootstrap };

/**
 * Each part of the app is its own chunk, so a client never downloads the master's code and the
 * other way round. Which one opens, the server decides (docs/PLAN.md, section 4.7).
 */
const SHELL_COMPONENTS = {
  client: lazy(() => import('./shells/client/ClientShell')),
  master: lazy(() => import('./shells/master/MasterShell')),
  staff: lazy(() => import('./shells/staff/StaffShell')),
} satisfies Record<Shell, LazyExoticComponent<ComponentType<ShellProps>>>;

export function App({
  initData,
  fallbackLang,
}: {
  initData: string | undefined;
  fallbackLang: Lang;
}) {
  if (!initData) {
    return (
      <I18nProvider lang={fallbackLang}>
        <NotInTelegram />
      </I18nProvider>
    );
  }
  return (
    <SessionProvider initData={initData}>
      <Visit fallbackLang={fallbackLang} />
    </SessionProvider>
  );
}

function Visit({ fallbackLang }: { fallbackLang: Lang }) {
  const bootstrap = useBootstrap();
  // The first screen switches language before anything is saved.
  const [chosenLang, setChosenLang] = useState<Lang | null>(null);
  const lang = chosenLang ?? bootstrap.data?.user.lang ?? fallbackLang;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  let content = null;
  if (bootstrap.isError) {
    content = <LoadError error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />;
  } else if (bootstrap.data && !bootstrap.data.user.consentGiven) {
    content = <Onboarding bootstrap={bootstrap.data} lang={lang} onLangChange={setChosenLang} />;
  } else if (bootstrap.data) {
    const ShellComponent = SHELL_COMPONENTS[bootstrap.data.shell];
    content = (
      <Suspense fallback={null}>
        <ShellComponent bootstrap={bootstrap.data} />
      </Suspense>
    );
  }
  return <I18nProvider lang={lang}>{content}</I18nProvider>;
}

function NotInTelegram() {
  const t = useT().notInTelegram;
  return (
    <FullScreenMessage icon={<Smartphone size={44} strokeWidth={1.6} />} title={t.title}>
      <p className="secondary">{t.text}</p>
    </FullScreenMessage>
  );
}

/** Client PDF, page 19: what went wrong and a way to try again. */
function LoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useT().error;
  const code = error instanceof ApiRequestError ? error.code : 'internal';
  return (
    <FullScreenMessage
      tone="danger"
      icon={<WifiOff size={44} strokeWidth={1.6} />}
      title={t.title}
      action={<Button onClick={onRetry}>{t.retry}</Button>}
    >
      <p className="secondary">{code === 'network' ? t.network : t.server}</p>
      {code !== 'network' && <p className="caption">{t.code(code)}</p>}
    </FullScreenMessage>
  );
}
