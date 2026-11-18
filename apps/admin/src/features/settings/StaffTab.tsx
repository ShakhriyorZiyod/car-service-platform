import type { Staff } from '@cs/shared';
import { formatDateLong, formatPhone } from '@cs/shared/format';
import { ROLE_LABELS } from '@cs/shared/i18n';
import { isPanelRole, LIMITS, ROLES, type Role } from '@cs/shared/vocabulary';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { call } from '../../api';
import { useLang, useT } from '../../i18n';
import { errorCodeOf, genericMessage, invalidFields } from '../../lib/errors';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';

const STAFF_KEY = ['staff'] as const;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** A13 (admin PDF, page 14): the list on the left, the chosen person on the right. */
export function StaffTab() {
  const t = useT();
  const lang = useLang();
  const list = useQuery({ queryKey: STAFF_KEY, queryFn: () => call('admin.staffList') });
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const select = (id: string) => {
    setCreating(false);
    setSelectedId(id);
  };

  const items = list.data?.items ?? [];
  const currentId = creating ? null : (selectedId ?? items[0]?.id ?? null);
  const current = items.find((member) => member.id === currentId) ?? null;

  return (
    <div className="staff">
      <section className="card staff__list">
        <header className="staff__list-head">
          <h2 className="section-title">{t.staff.count(items.length)}</h2>
          <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
            {t.staff.add}
          </Button>
        </header>
        {list.isError && <Notice tone="danger">{genericMessage(list.error, t)}</Notice>}
        <ul className="staff__rows">
          {items.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className={member.id === currentId ? 'staff__row is-active' : 'staff__row'}
                onClick={() => select(member.id)}
              >
                <span className="avatar">{initialsOf(member.fullName)}</span>
                <span className="staff__row-text">
                  <span className="staff__row-name">{member.fullName}</span>
                  <span className="muted">
                    {member.specialization ?? formatPhone(member.phone)}
                  </span>
                </span>
                <span className="staff__row-chips">
                  {member.isBlocked && <span className="chip chip--danger">{t.staff.blocked}</span>}
                  {member.roles.map((role) => (
                    <span key={role} className="chip">
                      {ROLE_LABELS[lang][role]}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card staff__editor">
        {creating ? (
          <StaffEditor key="new" staff={null} onSaved={(member) => select(member.id)} />
        ) : current ? (
          <StaffEditor key={current.id} staff={current} onSaved={(member) => select(member.id)} />
        ) : null}
      </section>
    </div>
  );
}

interface Form {
  fullName: string;
  phone: string;
  roles: Role[];
  specialization: string;
  login: string;
  password: string;
  isBlocked: boolean;
}

function StaffEditor({ staff, onSaved }: { staff: Staff | null; onSaved: (staff: Staff) => void }) {
  const t = useT();
  const lang = useLang();
  const queryClient = useQueryClient();
  const isNew = staff === null;
  const [form, setForm] = useState<Form>({
    fullName: staff?.fullName ?? '',
    phone: staff ? formatPhone(staff.phone) : '',
    roles: staff?.roles ?? ['master'],
    specialization: staff?.specialization ?? '',
    login: staff?.login ?? '',
    password: '',
    isBlocked: staff?.isBlocked ?? false,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const panel = form.roles.some(isPanelRole);
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const common = {
        fullName: form.fullName,
        roles: form.roles,
        specialization: form.specialization.trim() || null,
      };
      if (isNew) {
        return call('admin.createStaff', {
          body: {
            ...common,
            phone: form.phone,
            ...(panel && { login: form.login, password: form.password }),
          },
        });
      }
      return call('admin.updateStaff', {
        params: { id: staff.id },
        body: {
          ...common,
          ...(!staff.telegramLinked && { phone: form.phone }),
          login: panel ? form.login : null,
          isBlocked: form.isBlocked,
        },
      });
    },
    onSuccess: async (saved) => {
      setNotice(t.staff.saved);
      await queryClient.invalidateQueries({ queryKey: STAFF_KEY });
      onSaved(saved);
    },
    onError: () => setNotice(null),
  });

  const fields = invalidFields(save.error);
  const code = save.error ? errorCodeOf(save.error) : null;
  const fieldError = (name: string, message = t.errors.validation) =>
    fields.has(name) ? message : null;
  const conflict: Record<string, string> = {
    last_owner: t.staff.lastOwner,
    forbidden: t.staff.selfBlock,
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const toggleRole = (role: Role) =>
    set(
      'roles',
      form.roles.includes(role) ? form.roles.filter((r) => r !== role) : [...form.roles, role],
    );

  return (
    <div className="staff__editor-body">
      <header>
        <h2 className="section-title">{isNew ? t.staff.newTitle : staff.fullName}</h2>
        {staff?.lastSeen && (
          <p className="muted">
            {t.staff.lastSeen(
              `${formatDateLong(staff.lastSeen.date, lang)}, ${staff.lastSeen.time}`,
            )}
          </p>
        )}
      </header>

      {notice && <Notice tone="success">{notice}</Notice>}
      {save.error && (
        <Notice tone="danger">
          {conflict[code ?? ''] ??
            (code === 'login_taken'
              ? t.staff.loginTaken
              : code === 'phone_taken'
                ? t.staff.phoneTaken
                : genericMessage(save.error, t))}
        </Notice>
      )}
      {staff && !staff.telegramLinked && <Notice tone="info">{t.staff.linkHint}</Notice>}

      <form className="staff__form" onSubmit={submit}>
        <Field
          label={t.staff.fullName}
          value={form.fullName}
          required
          maxLength={LIMITS.fullName.max}
          error={fieldError('fullName')}
          onChange={(event) => set('fullName', event.target.value)}
        />
        <Field
          label={t.staff.phone}
          value={form.phone}
          required
          inputMode="tel"
          disabled={staff?.telegramLinked === true}
          hint={staff?.telegramLinked ? t.staff.phoneLocked : undefined}
          error={fieldError('phone', code === 'phone_taken' ? t.staff.phoneTaken : undefined)}
          onChange={(event) => set('phone', event.target.value)}
        />

        <fieldset className="staff__roles">
          <legend className="field__label">{t.staff.roles}</legend>
          {ROLES.map((role) => (
            <label key={role} className="staff__role">
              <input
                type="checkbox"
                checked={form.roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              <span>
                <span className="staff__role-name">{ROLE_LABELS[lang][role]}</span>
                <span className="muted">{t.staff.roleHints[role]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Field
          label={t.staff.specialization}
          value={form.specialization}
          hint={t.staff.specializationHint}
          maxLength={LIMITS.specialization.max}
          onChange={(event) => set('specialization', event.target.value)}
        />

        {panel && (
          <Field
            label={t.staff.login}
            value={form.login}
            required
            autoComplete="off"
            hint={t.staff.loginHint}
            error={fieldError('login', code === 'login_taken' ? t.staff.loginTaken : undefined)}
            onChange={(event) => set('login', event.target.value)}
          />
        )}
        {panel && isNew && (
          <Field
            label={t.staff.password}
            type="password"
            value={form.password}
            required
            autoComplete="new-password"
            minLength={LIMITS.password.min}
            hint={t.staff.passwordHint(LIMITS.password.min)}
            error={fieldError('password')}
            onChange={(event) => set('password', event.target.value)}
          />
        )}

        {!isNew && (
          <label className="staff__block">
            <input
              type="checkbox"
              checked={form.isBlocked}
              onChange={(event) => set('isBlocked', event.target.checked)}
            />
            {t.staff.block}
          </label>
        )}

        <div>
          <Button type="submit" busy={save.isPending} disabled={form.roles.length === 0}>
            {isNew ? t.staff.create : t.staff.save}
          </Button>
        </div>
      </form>

      {staff?.login && <PasswordForm staffId={staff.id} />}
    </div>
  );
}

function PasswordForm({ staffId }: { staffId: string }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const setPasswordMutation = useMutation({
    mutationFn: () =>
      call('admin.setStaffPassword', { params: { id: staffId }, body: { password } }),
    onSuccess: () => setPassword(''),
  });

  return (
    <form
      className="staff__password"
      onSubmit={(event) => {
        event.preventDefault();
        setPasswordMutation.mutate();
      }}
    >
      {setPasswordMutation.isSuccess && <Notice tone="success">{t.staff.passwordSet}</Notice>}
      {setPasswordMutation.error && (
        <Notice tone="danger">{genericMessage(setPasswordMutation.error, t)}</Notice>
      )}
      <Field
        label={t.staff.newPassword}
        type="password"
        value={password}
        autoComplete="new-password"
        minLength={LIMITS.password.min}
        hint={t.staff.passwordHint(LIMITS.password.min)}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div>
        <Button
          type="submit"
          variant="secondary"
          busy={setPasswordMutation.isPending}
          disabled={password.length < LIMITS.password.min}
        >
          {t.staff.setPassword}
        </Button>
      </div>
    </form>
  );
}
