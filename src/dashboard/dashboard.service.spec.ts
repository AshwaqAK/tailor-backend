/// <reference types="jest" />

import type { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';

import { AppointmentStatus } from '../appointments/enums/appointment-status.enum';
import type { AppointmentDocument } from '../appointments/schemas/appointment.schema';
import type { CustomerDocument } from '../customers/schemas/customer.schema';
import type { FabricDocument } from '../fabrics/schemas/fabric.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import type { OrderDocument } from '../orders/schemas/order.schema';
import type { TailoringServiceDocument } from '../services/schemas/tailoring-service.schema';
import { DashboardService } from './dashboard.service';

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));
jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('DashboardService', () => {
  let configService: { get: jest.Mock };
  let customerModel: { aggregate: jest.Mock };
  let orderModel: { aggregate: jest.Mock };
  let appointmentModel: { aggregate: jest.Mock; countDocuments: jest.Mock };
  let fabricModel: { aggregate: jest.Mock; countDocuments: jest.Mock };
  let tailoringServiceModel: { aggregate: jest.Mock };
  let service: DashboardService;

  const aggregation = (result: unknown) => ({
    exec: jest.fn().mockResolvedValue(result),
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-30T18:45:00.000Z'));
    configService = { get: jest.fn().mockReturnValue(5) };
    customerModel = { aggregate: jest.fn() };
    orderModel = { aggregate: jest.fn() };
    appointmentModel = { aggregate: jest.fn(), countDocuments: jest.fn() };
    fabricModel = { aggregate: jest.fn(), countDocuments: jest.fn() };
    tailoringServiceModel = { aggregate: jest.fn() };
    service = new DashboardService(
      configService as unknown as ConfigService,
      customerModel as unknown as Model<CustomerDocument>,
      orderModel as unknown as Model<OrderDocument>,
      appointmentModel as unknown as Model<AppointmentDocument>,
      fabricModel as unknown as Model<FabricDocument>,
      tailoringServiceModel as unknown as Model<TailoringServiceDocument>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('builds a complete summary from aggregation and count results', async () => {
    customerModel.aggregate.mockReturnValue(
      aggregation([
        { _id: true, count: 8 },
        { _id: false, count: 2 },
      ]),
    );
    orderModel.aggregate.mockReturnValue(
      aggregation([
        { _id: OrderStatus.DRAFT, count: 2 },
        { _id: OrderStatus.CONFIRMED, count: 3 },
        { _id: OrderStatus.IN_PROGRESS, count: 4 },
        { _id: OrderStatus.READY, count: 1 },
        { _id: OrderStatus.DELIVERED, count: 6 },
        { _id: OrderStatus.CANCELLED, count: 2 },
      ]),
    );
    appointmentModel.aggregate.mockReturnValue(
      aggregation([
        { _id: AppointmentStatus.SCHEDULED, count: 3 },
        { _id: AppointmentStatus.CONFIRMED, count: 2 },
        { _id: AppointmentStatus.COMPLETED, count: 5 },
        { _id: AppointmentStatus.CANCELLED, count: 1 },
        { _id: AppointmentStatus.NO_SHOW, count: 1 },
      ]),
    );
    appointmentModel.countDocuments.mockReturnValue(aggregation(4));
    fabricModel.aggregate.mockReturnValue(
      aggregation([
        { _id: true, count: 7 },
        { _id: false, count: 3 },
      ]),
    );
    fabricModel.countDocuments.mockReturnValue(aggregation(2));
    tailoringServiceModel.aggregate.mockReturnValue(
      aggregation([
        { _id: true, count: 9 },
        { _id: false, count: 1 },
      ]),
    );

    const result = await service.getSummary();

    expect(result).toEqual({
      totalCustomers: 10,
      activeCustomers: 8,
      totalOrders: 18,
      pendingOrders: 5,
      inProgressOrders: 5,
      completedOrders: 6,
      totalAppointments: 12,
      upcomingAppointments: 4,
      totalActiveFabrics: 7,
      totalActiveTailoringServices: 9,
      ordersByStatus: {
        DRAFT: 2,
        CONFIRMED: 3,
        IN_PROGRESS: 4,
        READY: 1,
        DELIVERED: 6,
        CANCELLED: 2,
      },
      appointmentsByStatus: {
        SCHEDULED: 3,
        CONFIRMED: 2,
        COMPLETED: 5,
        CANCELLED: 1,
        NO_SHOW: 1,
      },
      customersByActivity: { active: 8, inactive: 2 },
      fabricsByActivity: { active: 7, inactive: 3 },
      tailoringServicesByActivity: { active: 9, inactive: 1 },
      lowStockFabrics: { count: 2, threshold: 5 },
    });
  });

  it('uses UTC today, active statuses, and configured threshold in count queries', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    await service.getSummary();

    expect(configService.get).toHaveBeenCalledWith('app.fabricLowStockThreshold', 5);
    expect(appointmentModel.countDocuments).toHaveBeenCalledWith({
      appointmentDate: { $gte: new Date('2026-09-30T00:00:00.000Z') },
      status: {
        $in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
      },
    });
    expect(fabricModel.countDocuments).toHaveBeenCalledWith({
      isActive: true,
      quantity: { $lte: 5 },
    });
  });

  it('returns fully initialized zero counts for an empty database', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getSummary();

    expect(result).toMatchObject({
      totalCustomers: 0,
      activeCustomers: 0,
      totalOrders: 0,
      pendingOrders: 0,
      inProgressOrders: 0,
      completedOrders: 0,
      totalAppointments: 0,
      upcomingAppointments: 0,
      totalActiveFabrics: 0,
      totalActiveTailoringServices: 0,
      customersByActivity: { active: 0, inactive: 0 },
      fabricsByActivity: { active: 0, inactive: 0 },
      tailoringServicesByActivity: { active: 0, inactive: 0 },
      lowStockFabrics: { count: 0, threshold: 5 },
    });
    expect(Object.values(result.ordersByStatus)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Object.values(result.appointmentsByStatus)).toEqual([0, 0, 0, 0, 0]);
  });
});
