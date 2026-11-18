import type { ClientCatalog } from '@cs/shared';
import { formatDuration, formatMoney } from '@cs/shared/format';
import type { BodyClass } from '@cs/shared/vocabulary';
import { useState } from 'react';
import { useLang, useT } from '../i18n';

type Zone = ClientCatalog['serviceTypes'][number]['zones'][number];

const GROUPS = ['body', 'glass', 'interior', 'other'] as const;

/**
 * The zones of every kind of work, for one body class. A zone the class is not offered for, or one
 * that an already chosen zone replaces, cannot be picked; choosing a zone drops those it replaces.
 */
export function ZonePicker({
  catalog,
  bodyClass,
  selected,
  onChange,
}: {
  catalog: ClientCatalog;
  bodyClass: BodyClass;
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useT();
  const lang = useLang();
  const types = catalog.serviceTypes;
  const [typeId, setTypeId] = useState<string | null>(null);
  const current = types.find((type) => type.id === typeId) ?? types[0];

  const everyZone = types.flatMap((type) => type.zones);
  const chosen = everyZone.filter((zone) => selected.includes(zone.id));
  const replaced = new Set(chosen.flatMap((zone) => zone.excludes));

  const toggle = (zone: Zone) => {
    if (selected.includes(zone.id)) {
      onChange(selected.filter((id) => id !== zone.id));
    } else {
      onChange([...selected.filter((id) => !zone.excludes.includes(id)), zone.id]);
    }
  };

  const nameOf = (item: { nameUz: string; nameRu: string }) =>
    lang === 'ru' ? item.nameRu : item.nameUz;

  if (!current) return <p className="muted">{t.zones.empty}</p>;
  const countIn = (zones: readonly Zone[]) =>
    zones.filter((zone) => selected.includes(zone.id)).length;

  return (
    <div className="zones">
      <div className="pills">
        {types.map((type) => {
          const count = countIn(type.zones);
          return (
            <button
              key={type.id}
              type="button"
              className={type.id === current.id ? 'pill is-active' : 'pill'}
              onClick={() => setTypeId(type.id)}
            >
              {nameOf(type)}
              {count > 0 && <span className="zones__count num">{count}</span>}
            </button>
          );
        })}
      </div>

      {current.zones.length === 0 && <p className="muted">{t.zones.empty}</p>}
      {GROUPS.map((group) => {
        const zones = current.zones.filter((zone) => zone.group === group);
        if (zones.length === 0) return null;
        return (
          <fieldset key={group} className="zones__group">
            <legend className="zones__legend muted">{t.prices.groups[group]}</legend>
            {zones.map((zone) => {
              const cell = zone.prices.find((price) => price.bodyClass === bodyClass);
              const isSelected = selected.includes(zone.id);
              const blocked = !isSelected && replaced.has(zone.id);
              const disabled = !cell || blocked;
              return (
                <label key={zone.id} className={disabled ? 'zone is-disabled' : 'zone'}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => toggle(zone)}
                  />
                  <span className="zone__name">
                    {nameOf(zone)}
                    {!cell && <span className="muted zone__note">{t.zones.notOffered}</span>}
                    {cell && blocked && (
                      <span className="muted zone__note">{t.zones.excluded}</span>
                    )}
                  </span>
                  {cell && (
                    <span className="zone__price num">
                      {cell.price === null ? t.zones.agreed : formatMoney(cell.price, lang)}
                      <span className="muted zone__time">
                        {formatDuration(cell.durationMin, lang)}
                      </span>
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
