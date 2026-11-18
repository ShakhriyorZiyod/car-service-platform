import type { Bootstrap } from '@cs/shared';
import { LANG_NAMES, LANGS, type Lang } from '@cs/shared/i18n';
import { LIMITS } from '@cs/shared/vocabulary';
import { useMutation } from '@tanstack/react-query';
import { Check, Phone, Shield } from 'lucide-react';
import { useState } from 'react';
import { ApiRequestError } from '../api';
import { useApi, useSetBootstrap } from '../bootstrap';
import { useT } from '../i18n';
import { openExternal, requestPhone } from '../telegram';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { Segmented } from '../ui/Segmented';
import './onboarding.css';

/**
 * T0, the first visit (client PDF, page 8): language, name, consent, and the phone number shared
 * through Telegram. Without a number the client can still look around; booking asks for it later.
 */
export function Onboarding({
  bootstrap,
  lang,
  onLangChange,
}: {
  bootstrap: Bootstrap;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}) {
  const t = useT().onboarding;
  const api = useApi();
  const setBootstrap = useSetBootstrap();
  const [fullName, setFullName] = useState(bootstrap.user.fullName);
  const [consent, setConsent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Plain text until the owner has entered the policy's address in the settings.
  const policyUrl = bootstrap.workshop.policyUrl;

  const finish = useMutation({
    mutationFn: async (withPhone: boolean) => {
      const saved = await api.call('tma.saveOnboarding', {
        body: { lang, fullName: fullName.trim(), consent: true },
      });
      if (!withPhone) return saved;
      const contact = await requestPhone();
      if (!contact) return saved;
      try {
        return await api.call('tma.sharePhone', { body: { contact } });
      } catch (error) {
        // Consent is saved either way; the number can be shared again later.
        setBootstrap(saved);
        throw error;
      }
    },
    onSuccess: setBootstrap,
    onError: (error) => {
      const code = error instanceof ApiRequestError ? error.code : 'internal';
      setProblem(
        code === 'phone_taken'
          ? t.phoneTaken
          : code === 'invalid_contact'
            ? t.phoneFailed
            : t.failed,
      );
      window.scrollTo(0, 0);
    },
  });

  const submit = (withPhone: boolean) => {
    if (fullName.trim().length < LIMITS.fullName.min) return setProblem(t.needName);
    if (!consent) return setProblem(t.needConsent);
    setProblem(null);
    finish.mutate(withPhone);
  };

  return (
    <div className="onboarding">
      <header className="onboarding__hero">
        <div className="onboarding__brand">
          <span className="onboarding__logo" aria-hidden="true">
            <Shield size={22} strokeWidth={2} />
          </span>
          <span className="title">CarService</span>
        </div>
        <h1 className="onboarding__headline">{t.headline}</h1>
        <ul className="onboarding__benefits">
          {[t.benefits.price, t.benefits.time, t.benefits.ready].map((benefit) => (
            <li key={benefit}>
              <span className="onboarding__check" aria-hidden="true">
                <Check size={16} strokeWidth={3} />
              </span>
              {benefit}
            </li>
          ))}
        </ul>
      </header>

      <main className="onboarding__form">
        {problem && <Notice tone="danger">{problem}</Notice>}

        <section className="field">
          <span className="field__label">{t.lang}</span>
          <Segmented
            label={t.lang}
            value={lang}
            onChange={onLangChange}
            options={LANGS.map((value) => ({ value, label: LANG_NAMES[value] }))}
          />
        </section>

        <label className="field">
          <span className="field__label">{t.name}</span>
          <input
            className="field__input"
            value={fullName}
            maxLength={LIMITS.fullName.max}
            autoComplete="given-name"
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>

        <label className="check-card">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span className="secondary onboarding__consent">
            {t.consent}{' '}
            {policyUrl ? (
              <a
                className="onboarding__policy onboarding__policy--link"
                href={policyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  openExternal(policyUrl);
                }}
              >
                {t.policy}
              </a>
            ) : (
              <span className="onboarding__policy">{t.policy}</span>
            )}
          </span>
        </label>
      </main>

      <footer className="onboarding__actions">
        <Button
          icon={<Phone size={20} aria-hidden="true" />}
          busy={finish.isPending && finish.variables}
          disabled={finish.isPending}
          onClick={() => submit(true)}
        >
          {t.sharePhone}
        </Button>
        <p className="caption onboarding__hint">{t.phoneHint}</p>
        <Button variant="link" disabled={finish.isPending} onClick={() => submit(false)}>
          {t.later}
        </Button>
      </footer>
    </div>
  );
}
