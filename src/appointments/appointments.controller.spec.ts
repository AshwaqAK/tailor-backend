/// <reference types="jest" />

import { Role } from '../common/constants/role.enum';
import { AppointmentStatus } from './enums/appointment-status.enum';
import { AppointmentType } from './enums/appointment-type.enum';
import type { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('./appointments.service', () => ({
  AppointmentsService: class AppointmentsService {},
}));

describe('AppointmentsController', () => {
  const user = {
    sub: 'database-user-id',
    userId: 'USR-000001',
    role: Role.MANAGER,
  };

  it('passes the authenticated user ID when creating an appointment', async () => {
    const create = jest.fn();
    const controller = new AppointmentsController({ create } as unknown as AppointmentsService);
    const dto = {
      customerId: 'CUS-000001',
      orderId: 'ORD-000001',
      appointmentDate: new Date('2026-10-15T00:00:00.000Z'),
      appointmentTime: '14:30',
      type: AppointmentType.FITTING,
    };

    await controller.create(dto, user);

    expect(create).toHaveBeenCalledWith(dto, 'USR-000001');
  });

  it('delegates list, find-one, and delete operations', async () => {
    const findAll = jest.fn();
    const findOne = jest.fn();
    const remove = jest.fn();
    const controller = new AppointmentsController({
      findAll,
      findOne,
      remove,
    } as unknown as AppointmentsService);
    const query = {
      page: 2,
      limit: 5,
      status: AppointmentStatus.CONFIRMED,
      sortBy: 'appointmentDate' as const,
      sortOrder: 'asc' as const,
    };

    await controller.findAll(query);
    await controller.findOne('APT-000001');
    await controller.remove('APT-000001');

    expect(findAll).toHaveBeenCalledWith(query);
    expect(findOne).toHaveBeenCalledWith('APT-000001');
    expect(remove).toHaveBeenCalledWith('APT-000001');
  });

  it('passes the authenticated user ID when updating an appointment', async () => {
    const update = jest.fn();
    const controller = new AppointmentsController({ update } as unknown as AppointmentsService);
    const dto = { status: AppointmentStatus.CONFIRMED };

    await controller.update('APT-000001', dto, user);

    expect(update).toHaveBeenCalledWith('APT-000001', dto, 'USR-000001');
  });
});
