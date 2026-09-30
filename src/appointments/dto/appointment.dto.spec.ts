/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AppointmentStatus } from '../enums/appointment-status.enum';
import { AppointmentType } from '../enums/appointment-type.enum';
import { CreateAppointmentDto } from './create-appointment.dto';
import { UpdateAppointmentDto } from './update-appointment.dto';

describe('Appointment DTO validation', () => {
  const validAppointment = () => ({
    customerId: 'CUS-000001',
    orderId: 'ORD-000001',
    appointmentDate: '2026-10-15T00:00:00.000Z',
    appointmentTime: '14:30',
    type: AppointmentType.FITTING,
    notes: 'Bring the jacket',
  });

  it('accepts a valid appointment', async () => {
    await expect(
      validate(plainToInstance(CreateAppointmentDto, validAppointment())),
    ).resolves.toHaveLength(0);
  });

  it('rejects invalid customer and order references', async () => {
    const dto = plainToInstance(CreateAppointmentDto, {
      ...validAppointment(),
      customerId: 'customer-1',
      orderId: 'order-1',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['customerId', 'orderId']),
    );
  });

  it('rejects an invalid appointment date', async () => {
    const dto = plainToInstance(CreateAppointmentDto, {
      ...validAppointment(),
      appointmentDate: 'not-a-date',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('appointmentDate');
  });

  it('rejects an invalid appointment type', async () => {
    const dto = plainToInstance(CreateAppointmentDto, {
      ...validAppointment(),
      type: 'ALTERATION',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('type');
  });

  it('accepts a valid status and rejects an invalid status on update', async () => {
    await expect(
      validate(
        plainToInstance(UpdateAppointmentDto, {
          status: AppointmentStatus.CONFIRMED,
        }),
      ),
    ).resolves.toHaveLength(0);
    const errors = await validate(plainToInstance(UpdateAppointmentDto, { status: 'UNKNOWN' }));

    expect(errors.map((error) => error.property)).toContain('status');
  });

  it('rejects immutable and unsupported create fields', async () => {
    const dto = plainToInstance(CreateAppointmentDto, {
      ...validAppointment(),
      appointmentId: 'APT-000001',
      status: AppointmentStatus.COMPLETED,
      createdBy: 'USR-000001',
      updatedBy: 'USR-000002',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['appointmentId', 'status', 'createdBy', 'updatedBy']),
    );
  });

  it('rejects immutable and unsupported update fields', async () => {
    const dto = plainToInstance(UpdateAppointmentDto, {
      notes: 'Allowed update',
      appointmentId: 'APT-999999',
      createdBy: 'USR-999999',
      updatedBy: 'USR-999998',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['appointmentId', 'createdBy', 'updatedBy']),
    );
  });
});
