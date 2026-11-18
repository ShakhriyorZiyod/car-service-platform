import '@cs/shared/tokens.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import './styles/base.css';
import './styles/components.css';
import { DEFAULT_LANG, langFromCode, type Lang } from '@cs/shared/i18n';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ApiRequestError } from './api';
import { LoginPage } from './auth/LoginPage';
import { ME_KEY, MeProvider, useMeQuery } from './auth/session';
import { I18nProvider, useT } from './i18n';
import { genericMessage } from './lib/errors';
import { router } from './router';
import { Button } from './ui/Button';
import { Notice } from './ui/Notice';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

/** A 401 from any call means the session is over: asking `auth.me` again shows the sign-in page. */
const onError = (error: unknown) => {
  if (error instanceof ApiRequestError && error.status === 401) {
    void queryClient.invalidateQueries({ queryKey: ME_KEY });
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { staleTime: 15_000, retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

// Before signing in there is no profile language; in development `?lang=ru` previews Russian.
const initialLang: Lang = import.meta.env.DEV
  ? langFromCode(new URLSearchParams(location.search).get('lang'))
  : DEFAULT_LANG;

function Panel() {
  const me = useMeQuery();
  const [signInLang, setSignInLang] = useState(initialLang);
  const lang = me.data?.lang ?? signInLang;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (me.isPending) return null;
  return (
    <I18nProvider lang={lang}>
      {me.isError ? (
        <LoadError error={me.error} onRetry={() => void me.refetch()} />
      ) : me.data ? (
        <MeProvider me={me.data}>
          <RouterProvider router={router} />
        </MeProvider>
      ) : (
        <LoginPage lang={signInLang} onLangChange={setSignInLang} />
      )}
    </I18nProvider>
  );
}

function LoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useT();
  return (
    <main className="layout__page">
      <Notice tone="danger">{genericMessage(error, t)}</Notice>
      <p>
        <Button variant="secondary" onClick={onRetry}>
          {t.errors.retry}
        </Button>
      </p>
    </main>
  );
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Panel />
    </QueryClientProvider>
  </StrictMode>,
);
