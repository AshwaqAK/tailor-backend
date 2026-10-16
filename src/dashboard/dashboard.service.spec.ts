/// <reference types="jest" />

import type { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';

import { AppointmentStatus } from '../appointments/enums/appointment-status.enum';
import type { AppointmentDocument } from '../appointments/schemas/appointment.schema';
import type { CustomerDocument } from '../customers/schemas/customer.schema';
import { QuantityUnit } from '../fabrics/enums/quantity-unit.enum';
import type { FabricDocument } from '../fabrics/schemas/fabric.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { OrderType } from '../orders/enums/order-type.enum';
import type { OrderDocument } from '../orders/schemas/order.schema';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import type { PaymentDocument } from '../payments/schemas/payment.schema';
import type { TailoringServiceDocument } from '../services/schemas/tailoring-service.schema';
import { DashboardService } from './dashboard.service';
import { ReportDateQueryDto } from './dto/report-date-query.dto';

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
  let paymentModel: { aggregate: jest.Mock };
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
    paymentModel = { aggregate: jest.fn() };
    paymentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel = { aggregate: jest.fn(), countDocuments: jest.fn() };
    fabricModel = { aggregate: jest.fn(), countDocuments: jest.fn() };
    tailoringServiceModel = { aggregate: jest.fn() };
    service = new DashboardService(
      configService as unknown as ConfigService,
      customerModel as unknown as Model<CustomerDocument>,
      orderModel as unknown as Model<OrderDocument>,
      paymentModel as unknown as Model<PaymentDocument>,
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
        {
          ordersToday: [{ count: 3 }],
          classificationToday: [
            { _id: OrderType.STANDARD, count: 2 },
            { _id: OrderType.ALTERATION, count: 1 },
          ],
          statusCounts: [
            { _id: OrderStatus.DRAFT, count: 2 },
            { _id: OrderStatus.CONFIRMED, count: 3 },
            { _id: OrderStatus.IN_PROGRESS, count: 4 },
            { _id: OrderStatus.READY, count: 1 },
            { _id: OrderStatus.DELIVERED, count: 6 },
            { _id: OrderStatus.CANCELLED, count: 2 },
          ],
          orderValue: [{ total: 18000 }],
          orderValueByType: [
            { _id: OrderType.STANDARD, total: 15000 },
            { _id: OrderType.ALTERATION, total: 3000 },
          ],
          outstanding: [{ total: 7000, orderCount: 9 }],
          outstandingByType: [
            { _id: OrderType.STANDARD, total: 5000, orderCount: 7 },
            { _id: OrderType.ALTERATION, total: 2000, orderCount: 2 },
          ],
          recentOrders: [
            {
              orderId: 'ORD-000001',
              customerId: 'CUS-000001',
              customerName: 'Customer One',
              totalAmount: 2000,
              paidAmount: 500,
              balanceAmount: 1500,
              status: OrderStatus.IN_PROGRESS,
              orderType: OrderType.STANDARD,
              createdAt: new Date('2026-09-30T18:00:00.000Z'),
            },
          ],
          salesMix: [
            {
              tailoringAmount: 10000,
              attachedFabricAmount: 2500,
              fabricSaleAmount: 5500,
            },
          ],
        },
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
    fabricModel.aggregate.mockReturnValueOnce(
      aggregation([
        { _id: true, count: 7 },
        { _id: false, count: 3 },
      ]),
    );
    fabricModel.aggregate.mockReturnValueOnce(
      aggregation([
        { _id: QuantityUnit.METER, total: 42.5 },
        { _id: QuantityUnit.PIECE, total: 8 },
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
      ordersToday: 3,
      standardOrdersToday: 2,
      alterationBillsToday: 1,
      orderValue: 18000,
      standardOrderValue: 15000,
      alterationBillValue: 3000,
      outstanding: { total: 7000, orderCount: 9, standardTotal: 5000, alterationBillTotal: 2000 },
      recentOrders: [
        {
          orderId: 'ORD-000001',
          customerId: 'CUS-000001',
          customerName: 'Customer One',
          totalAmount: 2000,
          paidAmount: 500,
          balanceAmount: 1500,
          status: OrderStatus.IN_PROGRESS,
          orderType: OrderType.STANDARD,
          createdAt: new Date('2026-09-30T18:00:00.000Z'),
        },
      ],
      revenue: { collected: 0 },
      fabricStock: {
        activeFabricCount: 7,
        inactiveFabricCount: 3,
        availableQuantityByUnit: { METER: 42.5, PIECE: 8 },
        lowStock: { count: 2, threshold: 5 },
      },
      salesMix: {
        tailoringAmount: 10000,
        attachedFabricAmount: 2500,
        fabricSaleAmount: 5500,
        standardOrderValue: 15000,
        alterationBillAmount: 3000,
        totalOrderValue: 18000,
      },
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
    expect(result.ordersToday).toBe(0);
    expect(result.orderValue).toBe(0);
    expect(result.outstanding).toEqual({
      total: 0,
      orderCount: 0,
      standardTotal: 0,
      alterationBillTotal: 0,
    });
    expect(result.recentOrders).toEqual([]);
    expect(result.fabricStock).toEqual({
      activeFabricCount: 0,
      inactiveFabricCount: 0,
      availableQuantityByUnit: { METER: 0, PIECE: 0 },
      lowStock: { count: 0, threshold: 5 },
    });
    expect(result.salesMix).toEqual({
      tailoringAmount: 0,
      attachedFabricAmount: 0,
      fabricSaleAmount: 0,
      standardOrderValue: 0,
      alterationBillAmount: 0,
      totalOrderValue: 0,
    });
  });

  it('builds sales mix from persisted tailoring, attached-fabric, fabric-sale, and legacy item fields', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(
      aggregation([
        {
          ordersToday: [],
          statusCounts: [],
          orderValue: [{ total: 1800 }],
          orderValueByType: [{ _id: OrderType.STANDARD, total: 1800 }],
          outstanding: [],
          recentOrders: [],
          salesMix: [
            {
              tailoringAmount: 1000,
              attachedFabricAmount: 300,
              fabricSaleAmount: 500,
            },
          ],
        },
      ]),
    );
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getSummary();

    expect(result.salesMix).toEqual({
      tailoringAmount: 1000,
      attachedFabricAmount: 300,
      fabricSaleAmount: 500,
      standardOrderValue: 1800,
      alterationBillAmount: 0,
      totalOrderValue: 1800,
    });
    expect(
      result.salesMix.tailoringAmount +
        result.salesMix.attachedFabricAmount +
        result.salesMix.fabricSaleAmount,
    ).toBe(result.salesMix.totalOrderValue);
  });

  it('uses the same selected order date range for sales mix and order value', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    await service.getSummary(
      Object.assign(new ReportDateQueryDto(), {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
      }),
    );

    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    const expectedDateMatch = {
      $match: {
        createdAt: {
          $gte: new Date('2026-09-01T00:00:00.000Z'),
          $lt: new Date('2026-10-01T00:00:00.000Z'),
        },
      },
    };

    expect(facet.orderValue[0]).toEqual(expectedDateMatch);
    expect(facet.salesMix[0]).toEqual(expectedDateMatch);
  });

  it('aggregates active fabric quantities separately by unit', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.aggregate.mockReturnValueOnce(aggregation([]));
    fabricModel.aggregate.mockReturnValueOnce(
      aggregation([{ _id: QuantityUnit.METER, total: 12.5 }]),
    );
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.countDocuments.mockReturnValue(aggregation(1));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getSummary();

    expect(result.fabricStock.availableQuantityByUnit).toEqual({ METER: 12.5, PIECE: 0 });
    expect(fabricModel.aggregate.mock.calls[1][0]).toEqual([
      { $match: { isActive: true } },
      { $group: { _id: '$unit', total: { $sum: '$quantity' } } },
    ]);
  });

  it('uses the configured threshold at the low-stock boundary and only counts active fabrics', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(2));
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getSummary();

    expect(result.fabricStock.lowStock).toEqual({ count: 2, threshold: 5 });
    expect(fabricModel.countDocuments).toHaveBeenCalledWith({
      isActive: true,
      quantity: { $lte: 5 },
    });
  });

  it('applies the selected UTC date range to status counts and order value', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(
      aggregation([
        {
          ordersToday: [],
          statusCounts: [{ _id: OrderStatus.CONFIRMED, count: 2 }],
          orderValue: [{ total: 2500 }],
          outstanding: [],
          recentOrders: [],
        },
      ]),
    );
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    await service.getSummary(
      Object.assign(new ReportDateQueryDto(), {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
      }),
    );

    expect(orderModel.aggregate).toHaveBeenCalledWith([
      {
        $facet: expect.objectContaining({
          statusCounts: [
            {
              $match: {
                createdAt: {
                  $gte: new Date('2026-09-01T00:00:00.000Z'),
                  $lt: new Date('2026-10-01T00:00:00.000Z'),
                },
              },
            },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          orderValue: [
            {
              $match: {
                createdAt: {
                  $gte: new Date('2026-09-01T00:00:00.000Z'),
                  $lt: new Date('2026-10-01T00:00:00.000Z'),
                },
              },
            },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
          ],
        }),
      },
    ]);
  });

  it('includes only successful payments inside the selected paidAt range', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(
      aggregation([
        { ordersToday: [], statusCounts: [], orderValue: [], outstanding: [], recentOrders: [] },
      ]),
    );
    paymentModel.aggregate.mockReturnValue(aggregation([{ total: 1750 }]));
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getSummary(
      Object.assign(new ReportDateQueryDto(), {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
      }),
    );

    expect(result.revenue).toEqual({ collected: 1750 });
    expect(paymentModel.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          status: PaymentStatus.SUCCESS,
          paidAt: {
            $gte: new Date('2026-09-01T00:00:00.000Z'),
            $lt: new Date('2026-10-01T00:00:00.000Z'),
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
  });

  it('excludes pending, failed, and refunded payments through the status match', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(
      aggregation([
        { ordersToday: [], statusCounts: [], orderValue: [], outstanding: [], recentOrders: [] },
      ]),
    );
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    await service.getSummary();

    expect(paymentModel.aggregate.mock.calls[0][0][0]).toEqual({
      $match: { status: PaymentStatus.SUCCESS },
    });
  });

  it('returns zero collected revenue when no payments match', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getSummary();

    expect(result.revenue).toEqual({ collected: 0 });
    expect(result.orderValue).toBe(0);
    expect(result.ordersByStatus).toEqual({
      DRAFT: 0,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      READY: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    });
  });

  it('uses the current UTC day boundaries for ordersToday', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(
      aggregation([
        { ordersToday: [], statusCounts: [], orderValue: [], outstanding: [], recentOrders: [] },
      ]),
    );
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    await service.getSummary();

    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const ordersToday = (pipeline[0].$facet as Record<string, unknown>).ordersToday as Array<
      Record<string, unknown>
    >;
    expect(ordersToday[0]).toEqual({
      $match: {
        createdAt: {
          $gte: new Date('2026-09-30T00:00:00.000Z'),
          $lt: new Date('2026-10-01T00:00:00.000Z'),
        },
      },
    });
  });

  it('requests non-cancelled outstanding balances and customer details for five recent orders', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([]));
    orderModel.aggregate.mockReturnValue(
      aggregation([
        { ordersToday: [], statusCounts: [], orderValue: [], outstanding: [], recentOrders: [] },
      ]),
    );
    appointmentModel.aggregate.mockReturnValue(aggregation([]));
    appointmentModel.countDocuments.mockReturnValue(aggregation(0));
    fabricModel.aggregate.mockReturnValue(aggregation([]));
    fabricModel.countDocuments.mockReturnValue(aggregation(0));
    tailoringServiceModel.aggregate.mockReturnValue(aggregation([]));

    await service.getSummary();

    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    expect(facet.outstanding).toEqual([
      { $match: { status: { $ne: OrderStatus.CANCELLED } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$balanceAmount' },
          orderCount: { $sum: 1 },
        },
      },
    ]);
    expect(facet.recentOrders.slice(0, 3)).toEqual([
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: 'customerId',
          as: 'customer',
        },
      },
    ]);
  });
});
