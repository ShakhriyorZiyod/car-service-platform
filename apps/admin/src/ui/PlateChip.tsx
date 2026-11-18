import { formatPlate } from '@cs/shared/format';

/** The plate as on the car: white in every theme, the region split off (docs/DESIGN.md, 2.4). */
export function PlateChip({ plate }: { plate: string }) {
  const { region, number } = formatPlate(plate);
  return (
    <span className="plate">
      {region && <span className="plate__region num">{region}</span>}
      <span className="plate__number num">{number}</span>
    </span>
  );
}
