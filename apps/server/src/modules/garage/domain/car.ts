import { normalizePlate } from '@cs/shared/format';
import type { BodyClass } from '@cs/shared/vocabulary';

/**
 * What makes a car acceptable (docs/PLAN.md, section 7.6). A car is a model from the list, or the
 * client's own words ("Other") with the body class they picked from the pictures; the admin
 * corrects the class later.
 */

export interface CarInput {
  modelId: string | null;
  customModelText: string | null;
  bodyClass: BodyClass | null;
  year: number;
  plate: string;
  color: string | null;
}

export type CarProblem =
  'model_required' | 'model_and_text' | 'body_class_required' | 'plate_invalid' | 'year_invalid';

export interface CarCheck {
  /** The plate in its stored form. */
  plate: string | null;
  problems: { field: keyof CarInput; problem: CarProblem }[];
}

/** `thisYear` comes from the clock: a car of next year's model may already be sold. */
export function checkCar(input: CarInput, thisYear: number): CarCheck {
  const problems: CarCheck['problems'] = [];

  if (input.modelId === null && input.customModelText === null) {
    problems.push({ field: 'modelId', problem: 'model_required' });
  } else if (input.modelId !== null && input.customModelText !== null) {
    problems.push({ field: 'customModelText', problem: 'model_and_text' });
  } else if (input.modelId === null && input.bodyClass === null) {
    problems.push({ field: 'bodyClass', problem: 'body_class_required' });
  }

  const plate = normalizePlate(input.plate);
  if (plate === null) problems.push({ field: 'plate', problem: 'plate_invalid' });

  if (!Number.isInteger(input.year) || input.year < 1950 || input.year > thisYear + 1) {
    problems.push({ field: 'year', problem: 'year_invalid' });
  }
  return { plate, problems };
}

/** "Chevrolet Onix", or the client's own words. */
export function carLabel(car: { brand: string | null; model: string }): string {
  return car.brand ? `${car.brand} ${car.model}` : car.model;
}
