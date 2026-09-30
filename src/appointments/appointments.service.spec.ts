/// <reference types="jest" />

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Connection, Model } from 'mongoose';

import type { CustomerDocument } from '../customers/schemas/customer.schema';
import type { OrderDocument } from '../orders/schemas/order.schema';
import type { CounterDocument } from '../users/schemas/counter.schema';
import { AppointmentQueryDto } from './dto/appointment-query.dto';
import { AppointmentStatus } from './enums/appointment-status.enum';
import { AppointmentType } from './enums/appointment-type.enum';
import type { AppointmentDocument } from './schemas/appointment.schema';
import { AppointmentsService } from './appointments.service';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('AppointmentsService', () => {
  const appointmentDate = new Date('2026-10-15T00:00:00.000Z');
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let appointmentModel: jest.Mock & {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOne: jest.Mock;
    findOneAndDelete: jest.Mock;
  };
  let customerModel: { exists: jest.Mock };
  let orderModel: { findOne: jest.Mock };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let service: AppointmentsService;

  const validDto = () => ({
    customerId: 'CUS-000001',
    orderId: 'ORD-000001',
    appointmentDate,
    appointmentTime: '14:30',
    type: AppointmentType.FITTING,
    notes: 'Bring the jacket',
  });

  const createAppointmentDocument = (
    overrides: Partial<AppointmentDocument> = {},
  ) => {
    const save = jest.fn();
    const appointment = {
      appointmentId: 'APT-000007',
      customerId: 'CUS-000001',
      orderId: 'ORD-000001',
      appointmentDate,
      appointmentTime: '14:30',
      type: AppointmentType.FITTING,
      status: AppointmentStatus.SCHEDULED,
      notes: 'Bring the jacket',
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
      save,
      ...overrides,
    } as unknown as AppointmentDocument;
    save.mockResolvedValue(appointment);
    return { appointment, save };
  };

  const queryWithSession = (result: unknown) => {
    const exec = jest.fn().mockResolvedValue(result);
    const sessionMethod = jest.fn().mockReturnValue({ exec });
    return { query: { session: sessionMethod, exec }, sessionMethod, exec };
  };

  const mockValidReferences = () => {
    const customer = queryWithSession({ _id: 'customer-id' });
    customerModel.exists.mockReturnValue(customer.query);
    const orderExec = jest.fn().mockResolvedValue({ customerId: 'CUS-000001' });
    const orderSession = jest.fn().mockReturnValue({ exec: orderExec });
    const select = jest.fn().mockReturnValue({ session: orderSession, exec: orderExec });
    orderModel.findOne.mockReturnValue({ select });
    return { customer, orderExec, orderSession, select };
  };

  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(true),
      endSession: jest.fn(),
    };
    appointmentModel = Object.assign(jest.fn(), {
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOne: jest.fn(),
      findOneAndDelete: jest.fn(),
    });
    customerModel = { exists: jest.fn() };
    orderModel = { findOne: jest.fn() };
    counterModel = { findOneAndUpdate: jest.fn() };
    service = new AppointmentsService(
      { startSession: jest.fn().mockResolvedValue(session) } as unknown as Connection,
      appointmentModel as unknown as Model<AppointmentDocument>,
      customerModel as unknown as Model<CustomerDocument>,
      orderModel as unknown as Model<OrderDocument>,
      counterModel as unknown as Model<CounterDocument>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates an appointment with a generated ID and authenticated-user audit fields', async () => {
    const references = mockValidReferences();
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    const { appointment, save } = createAppointmentDocument();
    appointmentModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(appointment, data),
    );

    const result = await service.create(validDto(), 'USR-000009');

    expect(customerModel.exists).toHaveBeenCalledWith({ customerId: 'CUS-000001' });
    expect(references.customer.sessionMethod).toHaveBeenCalledWith(session);
    expect(orderModel.findOne).toHaveBeenCalledWith({ orderId: 'ORD-000001' });
    expect(references.select).toHaveBeenCalledWith({ customerId: 1 });
    expect(references.orderSession).toHaveBeenCalledWith(session);
    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'appointment' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session,
      }),
    );
    expect(appointmentModel).toHaveBeenCalledWith({
      ...validDto(),
      appointmentId: 'APT-000007',
      createdBy: 'USR-000009',
      updatedBy: 'USR-000009',
    });
    expect(save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(result.appointmentId).toBe('APT-000007');
  });

  it('validates a customer even when no order is supplied', async () => {
    const customer = queryWithSession({ _id: 'customer-id' });
    customerModel.exists.mockReturnValue(customer.query);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 8 }),
    });
    const { appointment } = createAppointmentDocument({
      appointmentId: 'APT-000008',
      orderId: undefined,
    });
    appointmentModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(appointment, data),
    );
    const dto = validDto();
    delete dto.orderId;

    await service.create(dto, 'USR-000001');

    expect(customerModel.exists).toHaveBeenCalledWith({ customerId: 'CUS-000001' });
    expect(orderModel.findOne).not.toHaveBeenCalled();
  });

  it('rejects a missing customer and rolls back', async () => {
    customerModel.exists.mockReturnValue(queryWithSession(null).query);

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new NotFoundException('Customer not found'),
    );
    expect(orderModel.findOne).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('validates an existing order for the requested customer', async () => {
    const references = mockValidReferences();
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 9 }),
    });
    const { appointment } = createAppointmentDocument({ appointmentId: 'APT-000009' });
    appointmentModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(appointment, data),
    );

    await service.create(validDto(), 'USR-000001');

    expect(references.orderExec).toHaveBeenCalled();
  });

  it('rejects a missing order', async () => {
    mockValidReferences();
    const exec = jest.fn().mockResolvedValue(null);
    orderModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue({ exec }),
        exec,
      }),
    });

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new NotFoundException('Order not found'),
    );
  });

  it('rejects an order belonging to another customer', async () => {
    mockValidReferences();
    const exec = jest.fn().mockResolvedValue({ customerId: 'CUS-000002' });
    orderModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue({ exec }),
        exec,
      }),
    });

    await expect(service.create(validDto(), 'USR-000001')).rejects.toThrow(
      new BadRequestException('Order does not belong to the requested customer'),
    );
  });

  it('returns all appointments with default sorting and pagination', async () => {
    const { appointment } = createAppointmentDocument();
    const exec = jest.fn().mockResolvedValue([appointment]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    appointmentModel.find.mockReturnValue({ sort });
    appointmentModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });

    const result = await service.findAll(new AppointmentQueryDto());

    expect(appointmentModel.find).toHaveBeenCalledWith({});
    expect(sort).toHaveBeenCalledWith({ appointmentDate: 1 });
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: [appointment],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('applies filters, descending sorting, and requested pagination', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    appointmentModel.find.mockReturnValue({ sort });
    appointmentModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(21),
    });
    const query = {
      page: 3,
      limit: 10,
      customerId: 'CUS-000001',
      orderId: 'ORD-000001',
      appointmentDate,
      type: AppointmentType.FITTING,
      status: AppointmentStatus.CONFIRMED,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    const result = await service.findAll(query);

    const expectedFilter = {
      customerId: 'CUS-000001',
      orderId: 'ORD-000001',
      appointmentDate,
      type: AppointmentType.FITTING,
      status: AppointmentStatus.CONFIRMED,
    };
    expect(appointmentModel.find).toHaveBeenCalledWith(expectedFilter);
    expect(appointmentModel.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(skip).toHaveBeenCalledWith(20);
    expect(limit).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({ page: 3, limit: 10, total: 21, totalPages: 3 });
  });

  it('finds one appointment by its generated ID', async () => {
    const { appointment } = createAppointmentDocument();
    appointmentModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(appointment),
    });

    await expect(service.findOne('APT-000007')).resolves.toBe(appointment);
    expect(appointmentModel.findOne).toHaveBeenCalledWith({
      appointmentId: 'APT-000007',
    });
  });

  it('throws when an appointment is missing', async () => {
    appointmentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.findOne('APT-999999')).rejects.toThrow(
      new NotFoundException('Appointment not found'),
    );
  });

  it('updates mutable fields and records updatedBy from the authenticated user', async () => {
    const { appointment, save } = createAppointmentDocument();
    appointmentModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(appointment),
    });
    customerModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'customer-id' }),
    });
    orderModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ customerId: 'CUS-000002' }),
      }),
    });
    const nextDate = new Date('2026-10-20T00:00:00.000Z');

    const result = await service.update(
      'APT-000007',
      {
        customerId: 'CUS-000002',
        orderId: 'ORD-000002',
        appointmentDate: nextDate,
        appointmentTime: '16:45',
        type: AppointmentType.TRIAL,
        notes: 'Updated notes',
      },
      'USR-000010',
    );

    expect(save).toHaveBeenCalledWith();
    expect(result).toMatchObject({
      appointmentId: 'APT-000007',
      customerId: 'CUS-000002',
      orderId: 'ORD-000002',
      appointmentDate: nextDate,
      appointmentTime: '16:45',
      type: AppointmentType.TRIAL,
      notes: 'Updated notes',
      createdBy: 'USR-000001',
      updatedBy: 'USR-000010',
    });
  });

  it.each([
    [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
    [AppointmentStatus.SCHEDULED, AppointmentStatus.NO_SHOW],
    [AppointmentStatus.CONFIRMED, AppointmentStatus.NO_SHOW],
  ])('allows status transition from %s to %s', async (from, to) => {
    const { appointment, save } = createAppointmentDocument({ status: from });
    appointmentModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(appointment),
    });
    customerModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'customer-id' }),
    });
    orderModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ customerId: 'CUS-000001' }),
      }),
    });

    const result = await service.update('APT-000007', { status: to }, 'USR-000012');

    expect(result.status).toBe(to);
    expect(result.updatedBy).toBe('USR-000012');
    expect(save).toHaveBeenCalled();
  });

  it.each([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED])(
    'allows cancellation from %s',
    async (from) => {
      const { appointment } = createAppointmentDocument({ status: from });
      appointmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(appointment),
      });
      customerModel.exists.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'customer-id' }),
      });
      orderModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ customerId: 'CUS-000001' }),
        }),
      });

      const result = await service.update(
        'APT-000007',
        { status: AppointmentStatus.CANCELLED },
        'USR-000013',
      );

      expect(result.status).toBe(AppointmentStatus.CANCELLED);
      expect(result.updatedBy).toBe('USR-000013');
    },
  );

  it('allows a confirmed appointment to be completed', async () => {
    const { appointment } = createAppointmentDocument({
      status: AppointmentStatus.CONFIRMED,
    });
    appointmentModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(appointment),
    });
    customerModel.exists.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'customer-id' }),
    });
    orderModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ customerId: 'CUS-000001' }),
      }),
    });

    const result = await service.update(
      'APT-000007',
      { status: AppointmentStatus.COMPLETED },
      'USR-000014',
    );

    expect(result.status).toBe(AppointmentStatus.COMPLETED);
    expect(result.updatedBy).toBe('USR-000014');
  });

  it.each([
    [AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED],
    [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
    [AppointmentStatus.CANCELLED, AppointmentStatus.CONFIRMED],
    [AppointmentStatus.NO_SHOW, AppointmentStatus.CONFIRMED],
    [AppointmentStatus.SCHEDULED, AppointmentStatus.SCHEDULED],
  ])('rejects invalid status transition from %s to %s', async (from, to) => {
    const { appointment, save } = createAppointmentDocument({ status: from });
    appointmentModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(appointment),
    });

    await expect(
      service.update('APT-000007', { status: to }, 'USR-000001'),
    ).rejects.toThrow(
      new BadRequestException(
        `Appointment status cannot transition from ${from} to ${to}`,
      ),
    );
    expect(save).not.toHaveBeenCalled();
    expect(customerModel.exists).not.toHaveBeenCalled();
  });

  it('deletes an appointment by ID', async () => {
    const { appointment } = createAppointmentDocument();
    appointmentModel.findOneAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(appointment),
    });

    await expect(service.remove('APT-000007')).resolves.toBe(appointment);
    expect(appointmentModel.findOneAndDelete).toHaveBeenCalledWith({
      appointmentId: 'APT-000007',
    });
  });

  it('throws when deleting a missing appointment', async () => {
    appointmentModel.findOneAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(service.remove('APT-999999')).rejects.toThrow(
      new NotFoundException('Appointment not found'),
    );
  });
});
