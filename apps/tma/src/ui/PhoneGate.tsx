import { useMutation } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ApiRequestError } from '../api';
import { useApi, useBootstrap, useSetBootstrap } from '../bootstrap';
import { useT } from '../i18n';
import { requestPhone } from '../telegram';
import { Button } from './Button';
import { Notice } from './Notice';

/**
 * The garage and booking need a phone number the workshop can call. Until the client has shared
 * theirs through Telegram, this stands in the way and asks for it (docs/PLAN.md, section 4.7).
 */
export function PhoneGate({ children }: { children: ReactNode }) {
  const t = useT().client.phone;
  const api = useApi();
  const bootstrap = useBootstrap();
  const setBootstrap = useSetBootstrap();
  const [problem, setProblem] = useState<string | null>(null);

  const share = useMutation({
    mutationFn: async () => {
      const contact = await requestPhone();
      if (!contact) throw new Error('declined');
      return api.call('tma.sharePhone', { body: { contact } });
    },
    onSuccess: (result) => {
      setProblem(null);
      setBootstrap(result);
    },
    onError: (error) =>
      setProblem(
        error instanceof ApiRequestError && error.code === 'phone_taken' ? t.taken : t.failed,
      ),
  });

  if (bootstrap.data?.user.phone) return <>{children}</>;
  return (
    <div className="phone-gate">
      <span className="empty-state__icon" aria-hidden="true">
        <Phone size={28} />
      </span>
      <h2 className="title">{t.title}</h2>
      <p className="secondary">{t.text}</p>
      {problem && <Notice tone="danger">{problem}</Notice>}
      <Button
        icon={<Phone size={20} aria-hidden="true" />}
        busy={share.isPending}
        onClick={() => share.mutate()}
      >
        {t.share}
      </Button>
    </div>
  );
}
