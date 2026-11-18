import { formatPlate } from '@cs/shared/format';
import { LANG_NAMES, LANGS, type Lang } from '@cs/shared/i18n';
import { LIMITS } from '@cs/shared/vocabulary';
import { useMutation } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { call } from '../api';
import { useT, type Texts } from '../i18n';
import { errorCodeOf, genericMessage } from '../lib/errors';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Notice } from '../ui/Notice';
import { useSetMe } from './session';
import './login.css';

interface Challenge {
  challengeId: string;
  resendAt: number;
}

function messageOf(error: unknown, t: Texts): string {
  const messages: Record<string, string> = {
    invalid_credentials: t.login.invalidCredentials,
    login_locked: t.login.locked,
    forbidden: t.login.noPanel,
    two_factor_unavailable: t.login.twoFactorUnavailable,
    rate_limited: t.login.tooSoon,
    invalid_code: t.login.invalidCode,
    code_expired: t.login.codeExpired,
  };
  return messages[errorCodeOf(error)] ?? genericMessage(error, t);
}

/** Seconds left until `at`, ticking every second. */
function useSecondsUntil(at: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === undefined) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [at]);
  return at === undefined ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** A0 (admin PDF, page 6): login or phone and password, then the bot's code for directors and owners. */
export function LoginPage({
  lang,
  onLangChange,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}) {
  const t = useT();
  const setMe = useSetMe();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const resendIn = useSecondsUntil(challenge?.resendAt);

  const signIn = useMutation({
    mutationFn: () => call('auth.login', { body: { login: identifier, password } }),
    onSuccess: (result) => {
      if (result.status === 'signed_in') return setMe(result.me);
      setCode('');
      setChallenge({
        challengeId: result.challengeId,
        resendAt: Date.now() + result.resendAfterSec * 1000,
      });
    },
  });

  const verify = useMutation({
    mutationFn: (challengeId: string) => call('auth.verifyCode', { body: { challengeId, code } }),
    onSuccess: (result) => setMe(result.me),
    onError: (error) => {
      if (errorCodeOf(error) === 'code_expired') setChallenge(null);
    },
  });

  const error = signIn.error ?? verify.error;
  const plate = formatPlate('01A777BA');

  const submitCredentials = (event: FormEvent) => {
    event.preventDefault();
    verify.reset();
    signIn.mutate();
  };
  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (challenge) verify.mutate(challenge.challengeId);
  };

  return (
    <div className="login">
      <aside className="login__brand">
        <div className="login__logo">
          <span className="login__logo-mark" aria-hidden="true">
            <Shield size={18} strokeWidth={2.2} />
          </span>
          <span className="section-title">{t.brand}</span>
        </div>
        <div className="login__pitch">
          <h1 className="login__headline">{t.login.headline}</h1>
          <p className="login__lead">{t.login.lead}</p>
        </div>
        <span className="login__plate num" aria-hidden="true">
          <span>{plate.region}</span>
          <span>{plate.number}</span>
        </span>
      </aside>

      <main className="login__main">
        <div className="login__panel">
          <div className="login__langs">
            {LANGS.map((value) => (
              <button
                key={value}
                type="button"
                className={value === lang ? 'login__lang is-active' : 'login__lang'}
                onClick={() => onLangChange(value)}
              >
                {LANG_NAMES[value]}
              </button>
            ))}
          </div>
          <h2 className="page-title">{t.login.title}</h2>
          <p className="muted">{t.login.subtitle}</p>

          {error && <Notice tone="danger">{messageOf(error, t)}</Notice>}

          <form className="login__form" onSubmit={submitCredentials}>
            <Field
              label={t.login.identifier}
              value={identifier}
              autoComplete="username"
              required
              disabled={challenge !== null}
              onChange={(event) => setIdentifier(event.target.value)}
            />
            <Field
              label={t.login.password}
              type="password"
              value={password}
              autoComplete="current-password"
              required
              disabled={challenge !== null}
              onChange={(event) => setPassword(event.target.value)}
            />
            {!challenge && (
              <Button type="submit" busy={signIn.isPending}>
                {t.login.submit}
              </Button>
            )}
          </form>

          {challenge && (
            <form className="login__code" onSubmit={submitCode}>
              <p className="section-title">{t.login.codeTitle}</p>
              <p className="muted">{t.login.codeText}</p>
              <input
                className="login__code-input num"
                aria-label={t.login.code}
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={LIMITS.codeLength}
                pattern="\d{6}"
                autoFocus
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
              <Button
                type="submit"
                busy={verify.isPending}
                disabled={code.length !== LIMITS.codeLength}
              >
                {t.login.confirm}
              </Button>
              <div className="login__code-links">
                {resendIn > 0 ? (
                  <span className="muted">{t.login.resendIn(mmss(resendIn))}</span>
                ) : (
                  <Button variant="ghost" busy={signIn.isPending} onClick={() => signIn.mutate()}>
                    {t.login.resend}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setChallenge(null)}>
                  {t.login.back}
                </Button>
              </div>
            </form>
          )}

          <p className="login__note muted">
            {t.login.lockNote} {t.login.forgot}
          </p>
        </div>
      </main>
    </div>
  );
}
