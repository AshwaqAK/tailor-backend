/// <reference types="jest" />

import { Role } from '../common/constants/role.enum';
import { ClothingType } from './enums/clothing-type.enum';
import { FitPreference } from './enums/fit-preference.enum';
import type { MeasurementsService } from './measurements.service';
import { MeasurementsController } from './measurements.controller';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('./measurements.service', () => ({
  MeasurementsService: class MeasurementsService {},
}));

describe('MeasurementsController', () => {
  it('passes the authenticated user ID when creating a measurement', async () => {
    const createMeasurement = jest.fn();
    const controller = new MeasurementsController({
      createMeasurement,
    } as unknown as MeasurementsService);
    const dto = {
      customerId: 'CUS-000001',
      clothingType: ClothingType.SHIRT,
      version: 1,
      measurements: { chest: 40 },
      measuredAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    await controller.create(dto, {
      sub: 'database-user-id',
      userId: 'USR-000001',
      role: Role.RECEPTIONIST,
    });

    expect(createMeasurement).toHaveBeenCalledWith(dto, 'USR-000001');
  });

  it('passes the measurement ID and authenticated user ID when updating a measurement', async () => {
    const updateMeasurement = jest.fn();
    const controller = new MeasurementsController({
      updateMeasurement,
    } as unknown as MeasurementsService);
    const dto = {
      measurements: { chest: 42 },
      fitPreference: FitPreference.LOOSE,
    };

    await controller.update('measurement-object-id', dto, {
      sub: 'database-user-id',
      userId: 'USR-000001',
      role: Role.RECEPTIONIST,
    });

    expect(updateMeasurement).toHaveBeenCalledWith('measurement-object-id', dto, 'USR-000001');
  });
});
