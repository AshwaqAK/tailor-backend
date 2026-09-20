import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({
  name: 'measurementValues',
  async: false,
})
export class MeasurementValuesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    return Object.values(value as Record<string, unknown>).every(
      (measurement) => typeof measurement === 'number' && Number.isFinite(measurement),
    );
  }

  defaultMessage(): string {
    return 'each measurement value must be a finite number expressed in inches';
  }
}
