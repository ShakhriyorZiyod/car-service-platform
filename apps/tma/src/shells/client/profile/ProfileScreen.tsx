import type { Bootstrap } from '@cs/shared';
import { formatPhone } from '@cs/shared/format';
import { LANG_NAMES, LANGS, type Lang } from '@cs/shared/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi, useSetBootstrap } from '../../../bootstrap';
import { useT } from '../../../i18n';
import { errorText } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { Notice } from '../../../ui/Notice';
import { Segmented } from '../../../ui/Segmented';
import { ThemeSwitch } from '../../../ui/ThemeSwitch';

/** T13: the profile: language, name, reminders and the phone the workshop calls. */
export function ProfileScreen({ bootstrap }: { bootstrap: Bootstrap }) {
  const t = useT().client;
  const api = useApi();
  const setBootstrap = useSetBootstrap();
  const [name, setName] = useState(bootstrap.user.fullName);
  const [saved, setSaved] = useState(false);

  const update = useMutation({
    mutationFn: (patch: { lang?: Lang; fullName?: string; remindersEnabled?: boolean }) =>
      api.call('tma.updateMe', { body: patch }),
    onSuccess: (result) => {
      setBootstrap(result);
      setSaved(true);
    },
  });

  return (
    <section className="screen">
      <h1 className="title-xl">{t.profile.title}</h1>
      {saved && <Notice tone="info">{t.common.saved}</Notice>}
      {update.isError && <Notice tone="danger">{errorText(t, update.error)}</Notice>}

      <div className="field">
        <span className="field__label">{t.profile.lang}</span>
        <Segmented
          label={t.profile.lang}
          value={bootstrap.user.lang}
          onChange={(lang) => update.mutate({ lang })}
          options={LANGS.map((lang) => ({ value: lang, label: LANG_NAMES[lang] }))}
        />
      </div>
      <ThemeSwitch />

      <label className="field">
        <span className="field__label">{t.profile.name}</span>
        <input
          className="field__input"
          value={name}
          maxLength={100}
          onChange={(event) => {
            setSaved(false);
            setName(event.target.value);
          }}
        />
      </label>
      <Button
        variant="secondary"
        busy={update.isPending}
        disabled={name.trim() === '' || name.trim() === bootstrap.user.fullName}
        onClick={() => update.mutate({ fullName: name.trim() })}
      >
        {t.common.save}
      </Button>

      <label className="card toggle-row">
        <span className="toggle-row__text">
          <span>{t.profile.reminders}</span>
          <span className="secondary">{t.profile.remindersHint}</span>
        </span>
        <input
          type="checkbox"
          className="toggle"
          checked={bootstrap.user.remindersEnabled}
          onChange={(event) => update.mutate({ remindersEnabled: event.target.checked })}
        />
      </label>

      <div className="card summary__row">
        <span className="secondary">{t.profile.phone}</span>
        <span className="num">
          {bootstrap.user.phone ? formatPhone(bootstrap.user.phone) : t.profile.noPhone}
        </span>
      </div>
    </section>
  );
}
