/// <reference types="jest" />

import type { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';

import { AppointmentStatus } from '../appointments/enums/appointment-status.enum';
import { AppointmentType } from '../appointments/enums/appointment-type.enum';
import type { AppointmentDocument } from '../appointments/schemas/appointment.schema';
import type { CustomerDocument } from '../customers/schemas/customer.schema';
import { QuantityUnit } from '../fabrics/enums/quantity-unit.enum';
import type { FabricDocument } from '../fabrics/schemas/fabric.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import type { OrderDocument } from '../orders/schemas/order.schema';
import { ServiceCategory } from '../services/enums/service-category.enum';
import type { TailoringServiceDocument } from '../services/schemas/tailoring-service.schema';
import { ReportDateQueryDto } from './dto/report-date-query.dto';
import { ReportsService } from './reports.service';

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));
jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('ReportsService', () => {
  let configService: { get: jest.Mock };
  let customerModel: { aggregate: jest.Mock };
  let orderModel: { aggregate: jest.Mock };
  let appointmentModel: { aggregate: jest.Mock };
  let fabricModel: { aggregate: jest.Mock };
  let tailoringServiceModel: { aggregate: jest.Mock };
  let service: ReportsService;

  const aggregation = (result: unknown) => ({
    exec: jest.fn().mockResolvedValue(result),
  });

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue(5) };
    customerModel = { aggregate: jest.fn() };
    orderModel = { aggregate: jest.fn() };
    appointmentModel = { aggregate: jest.fn() };
    fabricModel = { aggregate: jest.fn() };
    tailoringServiceModel = { aggregate: jest.fn() };
    service = new ReportsService(
      configService as unknown as ConfigService,
      customerModel as unknown as Model<CustomerDocument>,
      orderModel as unknown as Model<OrderDocument>,
      appointmentModel as unknown as Model<AppointmentDocument>,
      fabricModel as unknown as Model<FabricDocument>,
      tailoringServiceModel as unknown as Model<TailoringServiceDocument>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports customer totals and active/inactive counts', async () => {
    customerModel.aggregate.mockReturnValue(
      aggregation([
        { _id: true, count: 12 },
        { _id: false, count: 3 },
      ]),
    );

    const result = await service.getCustomerReport(new ReportDateQueryDto());

    expect(result).toEqual({
      totalCustomers: 15,
      activeCustomers: 12,
      inactiveCustomers: 3,
      registrationCount: 15,
    });
    expect(customerModel.aggregate).toHaveBeenCalledWith([
      { $group: { _id: '$isActive', count: { $sum: 1 } } },
    ]);
  });

  it('reports order totals and complete status grouping', async () => {
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

    const result = await service.getOrderReport(new ReportDateQueryDto());

    expect(result).toEqual({
      totalOrders: 18,
      ordersByStatus: {
        DRAFT: 2,
        CONFIRMED: 3,
        IN_PROGRESS: 4,
        READY: 1,
        DELIVERED: 6,
        CANCELLED: 2,
      },
      orderTotals: { pending: 5, inProgress: 5, completed: 6, cancelled: 2 },
    });
  });

  it('reports appointment totals grouped by status and type', async () => {
    appointmentModel.aggregate.mockReturnValue(
      aggregation([
        {
          byStatus: [
            { _id: AppointmentStatus.SCHEDULED, count: 3 },
            { _id: AppointmentStatus.COMPLETED, count: 4 },
          ],
          byType: [
            { _id: AppointmentType.CONSULTATION, count: 2 },
            { _id: AppointmentType.FITTING, count: 5 },
          ],
        },
      ]),
    );

    const result = await service.getAppointmentReport(new ReportDateQueryDto());

    expect(result.totalAppointments).toBe(7);
    expect(result.appointmentsByStatus).toEqual({
      SCHEDULED: 3,
      CONFIRMED: 0,
      COMPLETED: 4,
      CANCELLED: 0,
      NO_SHOW: 0,
    });
    expect(result.appointmentsByType).toEqual({
      CONSULTATION: 2,
      MEASUREMENT: 0,
      FITTING: 5,
      TRIAL: 0,
      PICKUP: 0,
    });
  });

  it('reports fabric activity, low stock, and quantity aggregation', async () => {
    fabricModel.aggregate.mockReturnValue(
      aggregation([
        {
          activity: [
            { _id: true, count: 6 },
            { _id: false, count: 2 },
          ],
          lowStock: [{ count: 3 }],
          availableQuantityByUnit: [
            { _id: QuantityUnit.METER, total: 40.5 },
            { _id: QuantityUnit.PIECE, total: 5 },
          ],
        },
      ]),
    );

    const result = await service.getFabricReport(new ReportDateQueryDto());

    expect(result).toEqual({
      totalFabrics: 8,
      activeFabrics: 6,
      inactiveFabrics: 2,
      lowStockFabrics: { count: 3, threshold: 5 },
      totalAvailableQuantity: null,
      availableQuantityByUnit: { METER: 40.5, PIECE: 5 },
    });
    expect(configService.get).toHaveBeenCalledWith('app.fabricLowStockThreshold', 5);
    expect(fabricModel.aggregate).toHaveBeenCalledWith([
      {
        $facet: {
          activity: [{ $group: { _id: '$isActive', count: { $sum: 1 } } }],
          lowStock: [{ $match: { isActive: true, quantity: { $lte: 5 } } }, { $count: 'count' }],
          availableQuantityByUnit: [
            { $match: { isActive: true } },
            { $group: { _id: '$unit', total: { $sum: '$quantity' } } },
          ],
        },
      },
    ]);
  });

  it('reports service activity and complete category grouping', async () => {
    tailoringServiceModel.aggregate.mockReturnValue(
      aggregation([
        {
          activity: [
            { _id: true, count: 7 },
            { _id: false, count: 1 },
          ],
          byCategory: [
            { _id: ServiceCategory.STITCHING, count: 3 },
            { _id: ServiceCategory.REPAIR, count: 5 },
          ],
        },
      ]),
    );

    const result = await service.getServiceReport(new ReportDateQueryDto());

    expect(result).toEqual({
      totalServices: 8,
      activeServices: 7,
      inactiveServices: 1,
      servicesByCategory: {
        STITCHING: 3,
        ALTERATION: 0,
        CUSTOM_TAILORING: 0,
        REPAIR: 5,
        OTHER: 0,
      },
    });
  });

  it('reports a numeric total when active fabric quantity has one unit', async () => {
    fabricModel.aggregate.mockReturnValue(
      aggregation([
        {
          activity: [{ _id: true, count: 2 }],
          lowStock: [],
          availableQuantityByUnit: [{ _id: QuantityUnit.METER, total: 12.5 }],
        },
      ]),
    );

    const result = await service.getFabricReport(new ReportDateQueryDto());

    expect(result.totalAvailableQuantity).toBe(12.5);
    expect(result.availableQuantityByUnit).toEqual({ METER: 12.5, PIECE: 0 });
  });

  it.each([
    ['customer', 'createdAt'],
    ['order', 'createdAt'],
    ['appointment', 'appointmentDate'],
    ['fabric', 'createdAt'],
    ['service', 'createdAt'],
  ] as const)('applies date-only boundaries to the %s report using %s', async (report, field) => {
    const model =
      report === 'customer'
        ? customerModel
        : report === 'order'
          ? orderModel
          : report === 'appointment'
            ? appointmentModel
            : report === 'fabric'
              ? fabricModel
              : tailoringServiceModel;
    model.aggregate.mockReturnValue(aggregation([]));
    const query = Object.assign(new ReportDateQueryDto(), {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });

    if (report === 'customer') await service.getCustomerReport(query);
    if (report === 'order') await service.getOrderReport(query);
    if (report === 'appointment') await service.getAppointmentReport(query);
    if (report === 'fabric') await service.getFabricReport(query);
    if (report === 'service') await service.getServiceReport(query);

    expect(model.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          [field]: {
            $gte: new Date('2026-01-01T00:00:00.000Z'),
            $lt: new Date('2026-02-01T00:00:00.000Z'),
          },
        },
      },
      expect.any(Object),
    ]);
  });

  it('supports only fromDate and preserves its timezone instant', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    const query = Object.assign(new ReportDateQueryDto(), {
      fromDate: '2026-01-01T00:30:00+05:30',
    });

    await service.getCustomerReport(query);

    expect(customerModel.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          createdAt: { $gte: new Date('2025-12-31T19:00:00.000Z') },
        },
      },
      expect.any(Object),
    ]);
  });

  it('supports only toDate and includes the exact timestamp boundary', async () => {
    orderModel.aggregate.mockReturnValue(aggregation([]));
    const query = Object.assign(new ReportDateQueryDto(), {
      toDate: '2026-01-31T23:59:59.999Z',
    });

    await service.getOrderReport(query);

    expect(orderModel.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          createdAt: { $lt: new Date('2026-02-01T00:00:00.000Z') },
        },
      },
      expect.any(Object),
    ]);
  });

  it('returns initialized empty reports when an aggregation range has no results', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));
    const query = Object.assign(new ReportDateQueryDto(), {
      fromDate: '2030-01-01',
      toDate: '2030-01-02',
    });

    const [customers, orders, appointments, fabrics, services] = await Promise.all([
      service.getCustomerReport(query),
      service.getOrderReport(query),
      service.getAppointmentReport(query),
      service.getFabricReport(query),
      service.getServiceReport(query),
    ]);

    expect(customers.totalCustomers).toBe(0);
    expect(orders.totalOrders).toBe(0);
    expect(appointments.totalAppointments).toBe(0);
    expect(fabrics).toMatchObject({
      totalFabrics: 0,
      activeFabrics: 0,
      inactiveFabrics: 0,
      lowStockFabrics: { count: 0, threshold: 5 },
      totalAvailableQuantity: 0,
    });
    expect(services.totalServices).toBe(0);
  });
});
