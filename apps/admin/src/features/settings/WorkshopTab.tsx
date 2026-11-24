import type { Settings } from '@cs/shared';
import { phoneInputState } from '@cs/shared/format';
import { LIMITS, RULE_LIMITS } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { call } from '../../api';
import { useT } from '../../i18n';
import { genericMessage, invalidPaths } from '../../lib/errors';
import { WORKSHOP_KEY } from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PhoneField, phoneFieldText } from '../../ui/PhoneField';

const SETTINGS_KEY = ['settings'] as const;

/** The numbers among the rules; the reminders are a list and have their own field. */
const NUMBER_RULES = [
  'slotStepMin',
  'minLeadMin',
  'horizonDays',
  'bufferMin',
  'holdNewWorkMin',
  'holdNoAnswerHours',
  'callWarnMin',
  'callEscalateMin',
  'adminDiscountLimitPct',
] as const;
type NumberRule = (typeof NUMBER_RULES)[number];

interface Draft {
  name: string;
  address: string;
  phone: string;
  mapUrl: string;
  policyUrl: string;
  policyVersion: string;
  rules: Record<NumberRule, string>;
  reminderHours: string;
}

const draftOf = ({ workshop, rules }: Settings): Draft => ({
  name: workshop.name,
  address: workshop.address ?? '',
  phone: phoneFieldText(workshop.phone),
  mapUrl: workshop.mapUrl ?? '',
  policyUrl: workshop.policyUrl ?? '',
  policyVersion: workshop.policyVersion,
  rules: Object.fromEntries(NUMBER_RULES.map((key) => [key, String(rules[key])])) as Record<
    NumberRule,
    string
  >,
  reminderHours: rules.reminderHours.join(', '),
});

const blankToNull = (value: string): string | null => value.trim() || null;

/** "24, 2" → [24, 2]; anything that is not a whole number stays as NaN, so the server refuses it. */
const parseHours = (value: string): number[] =>
  value
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));

function settingsOf(draft: Draft): Settings {
  const rules = Object.fromEntries(
    NUMBER_RULES.map((key) => [
      key,
      draft.rules[key].trim() === '' ? Number.NaN : Number(draft.rules[key]),
    ]),
  ) as Record<NumberRule, number>;
  return {
    workshop: {
      name: draft.name,
      address: blankToNull(draft.address),
      // The number is optional: a field with only "+998" in it is none.
      phone: phoneInputState(draft.phone) === 'empty' ? null : draft.phone,
      mapUrl: blankToNull(draft.mapUrl),
      policyUrl: blankToNull(draft.policyUrl),
      policyVersion: draft.policyVersion,
    },
    rules: { ...rules, reminderHours: parseHours(draft.reminderHours) },
  };
}

/** "Ustaxona": what the workshop shows about itself and the numbers its rules run on (PLAN 7.4). */
export function WorkshopTab() {
  const t = useT();
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => call('admin.settings') });
  if (settings.isPending) return <p className="muted">{t.form.loading}</p>;
  if (settings.isError) return <Notice tone="danger">{genericMessage(settings.error, t)}</Notice>;
  return <WorkshopForm initial={settings.data} />;
}

function WorkshopForm({ initial }: { initial: Settings }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial));
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => call('admin.updateSettings', { body: settingsOf(draft) }),
    onSuccess: async (result) => {
      setDraft(draftOf(result));
      setSaved(true);
      queryClient.setQueryData(SETTINGS_KEY, result);
      await queryClient.invalidateQueries({ queryKey: WORKSHOP_KEY });
    },
    onError: () => setSaved(false),
  });

  const paths = invalidPaths(save.error);
  const errorAt = (path: string) =>
    [...paths].some((p) => p === path || p.startsWith(`${path}.`)) ? t.errors.validation : null;

  const change = (update: Partial<Omit<Draft, 'rules'>>) => {
    setSaved(false);
    setDraft((previous) => ({ ...previous, ...update }));
  };
  const changeRule = (key: NumberRule, value: string) => {
    setSaved(false);
    setDraft((previous) => ({ ...previous, rules: { ...previous.rules, [key]: value } }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="workshop" onSubmit={submit}>
      {saved && <Notice tone="success">{t.form.saved}</Notice>}
      {save.error && <Notice tone="danger">{genericMessage(save.error, t)}</Notice>}

      <section className="card form-stack workshop__card">
        <header>
          <h2 className="section-title">{t.workshop.infoTitle}</h2>
          <p className="muted">{t.workshop.infoLead}</p>
        </header>
        <Field
          label={t.workshop.name}
          value={draft.name}
          required
          maxLength={LIMITS.workshopName.max}
          error={errorAt('body.workshop.name')}
          onChange={(event) => change({ name: event.target.value })}
        />
        <Field
          label={t.workshop.address}
          value={draft.address}
          maxLength={LIMITS.address.max}
          error={errorAt('body.workshop.address')}
          onChange={(event) => change({ address: event.target.value })}
        />
        <div className="form-row">
          <PhoneField
            label={t.workshop.phone}
            value={draft.phone}
            hint={t.workshop.phoneHint}
            error={errorAt('body.workshop.phone')}
            onChange={(phone) => change({ phone })}
          />
          <Field
            label={t.workshop.policyVersion}
            value={draft.policyVersion}
            required
            maxLength={64}
            hint={t.workshop.policyVersionHint}
            error={errorAt('body.workshop.policyVersion')}
            onChange={(event) => change({ policyVersion: event.target.value })}
          />
        </div>
        <Field
          label={t.workshop.mapUrl}
          type="url"
          value={draft.mapUrl}
          placeholder="https://"
          hint={t.workshop.urlHint}
          error={errorAt('body.workshop.mapUrl')}
          onChange={(event) => change({ mapUrl: event.target.value })}
        />
        <Field
          label={t.workshop.policyUrl}
          type="url"
          value={draft.policyUrl}
          placeholder="https://"
          hint={t.workshop.urlHint}
          error={errorAt('body.workshop.policyUrl')}
          onChange={(event) => change({ policyUrl: event.target.value })}
        />
      </section>

      <section className="card form-stack workshop__card">
        <header>
          <h2 className="section-title">{t.workshop.rulesTitle}</h2>
          <p className="muted">{t.workshop.rulesLead}</p>
        </header>
        <div className="workshop__rules">
          {NUMBER_RULES.map((key) => (
            <Field
              key={key}
              label={t.workshop.rules[key].label}
              hint={t.workshop.rules[key].hint}
              type="number"
              inputMode="numeric"
              required
              min={RULE_LIMITS[key].min}
              max={RULE_LIMITS[key].max}
              value={draft.rules[key]}
              error={errorAt(`body.rules.${key}`)}
              onChange={(event) => changeRule(key, event.target.value)}
            />
          ))}
          <Field
            label={t.workshop.rules.reminderHours.label}
            hint={t.workshop.rules.reminderHours.hint}
            value={draft.reminderHours}
            error={errorAt('body.rules.reminderHours')}
            onChange={(event) => change({ reminderHours: event.target.value })}
          />
        </div>
      </section>

      <div>
        <Button
          type="submit"
          busy={save.isPending}
          disabled={phoneInputState(draft.phone) === 'incomplete'}
        >
          {t.form.save}
        </Button>
      </div>
    </form>
  );
}
