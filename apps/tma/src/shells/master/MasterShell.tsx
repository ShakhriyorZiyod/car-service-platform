import type { Bootstrap } from '@cs/shared';
import { LANG_NAMES, LANGS } from '@cs/shared/i18n';
import type { MasterTaskTab } from '@cs/shared/vocabulary';
import { ClipboardList, User } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useApi, useSetBootstrap } from '../../bootstrap';
import { useT } from '../../i18n';
import { useBack } from '../../lib/back';
import { useOnline } from '../../lib/online';
import { BottomBar } from '../../ui/client-parts';
import { Segmented } from '../../ui/Segmented';
import { QueueProvider } from '../../lib/photo-queue/QueueProvider';
import { QueueBanner } from '../../ui/QueueBanner';
import { TaskScreen } from './task/TaskScreen';
import { TasksScreen } from './tasks/TasksScreen';
import '../../styles/client.css';
import '../../styles/master.css';

/** A link from a bot message opens its task: `?task=<id>` (docs/PLAN.md, section 4.7). */
const linkedTask = (): string | null => new URLSearchParams(location.search).get('task');

/** The master's app: tasks, work and photo reports that survive a lost connection (stage 5). */
export default function MasterShell({ bootstrap }: { bootstrap: Bootstrap }) {
  return (
    <QueueProvider>
      <Master bootstrap={bootstrap} />
    </QueueProvider>
  );
}

function Master({ bootstrap }: { bootstrap: Bootstrap }) {
  const t = useT().master;
  const online = useOnline();
  const [screen, setScreen] = useState<'tasks' | 'profile'>('tasks');
  const [tab, setTab] = useState<MasterTaskTab>('today');
  const [taskId, setTaskId] = useState<string | null>(linkedTask);
  const close = useCallback(() => setTaskId(null), []);
  useBack(taskId ? close : null);

  if (taskId) {
    return (
      <div className="master">
        <QueueBanner />
        <TaskScreen taskId={taskId} onBack={close} />
      </div>
    );
  }

  return (
    <div className="master">
      <header className="master-header">
        <div>
          <h1 className="master-header__name">{bootstrap.user.fullName}</h1>
        </div>
        <span className={online ? 'master-online is-online' : 'master-online'}>
          <span className="master-online__dot" aria-hidden="true" />
          {online ? t.online : t.offline}
        </span>
      </header>
      <QueueBanner />
      {screen === 'tasks' ? (
        <TasksScreen tab={tab} onTab={setTab} onOpen={setTaskId} />
      ) : (
        <ProfileScreen bootstrap={bootstrap} />
      )}
      <BottomBar>
        <nav className="tab-bar">
          <button
            type="button"
            className={screen === 'tasks' ? 'tab-bar__item is-active' : 'tab-bar__item'}
            onClick={() => setScreen('tasks')}
          >
            <ClipboardList size={22} aria-hidden="true" />
            <span className="caption">{t.nav.tasks}</span>
          </button>
          <button
            type="button"
            className={screen === 'profile' ? 'tab-bar__item is-active' : 'tab-bar__item'}
            onClick={() => setScreen('profile')}
          >
            <User size={22} aria-hidden="true" />
            <span className="caption">{t.nav.profile}</span>
          </button>
        </nav>
      </BottomBar>
    </div>
  );
}

/** The master's profile: the language of the app (design 7.2). */
function ProfileScreen({ bootstrap }: { bootstrap: Bootstrap }) {
  const t = useT().master;
  const api = useApi();
  const setBootstrap = useSetBootstrap();
  return (
    <section className="screen master-profile">
      <h2 className="title">{t.profile.title}</h2>
      <div className="field">
        <span className="field__label">{t.profile.language}</span>
        <Segmented
          label={t.profile.language}
          value={bootstrap.user.lang}
          options={LANGS.map((lang) => ({ value: lang, label: LANG_NAMES[lang] }))}
          onChange={(lang) => void api.call('tma.updateMe', { body: { lang } }).then(setBootstrap)}
        />
      </div>
    </section>
  );
}
