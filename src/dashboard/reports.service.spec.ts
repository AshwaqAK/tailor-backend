/// <reference types="jest" />

import 'reflect-metadata';

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
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import type { PaymentDocument } from '../payments/schemas/payment.schema';
import { ServiceCategory } from '../services/enums/service-category.enum';
import type { TailoringServiceDocument } from '../services/schemas/tailoring-service.schema';
import {
  CustomerReportQueryDto,
  FabricSalesReportQueryDto,
  OrderReportQueryDto,
  PaymentReportQueryDto,
  ReportDateQueryDto,
  ServiceUsageReportQueryDto,
} from './dto/report-date-query.dto';
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
  let paymentModel: { aggregate: jest.Mock };
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
    paymentModel = { aggregate: jest.fn() };
    appointmentModel = { aggregate: jest.fn() };
    fabricModel = { aggregate: jest.fn() };
    tailoringServiceModel = { aggregate: jest.fn() };
    orderModel.aggregate.mockReturnValue(aggregation([]));
    service = new ReportsService(
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
    jest.clearAllMocks();
  });

  it('reports customer totals and active/inactive counts', async () => {
    customerModel.aggregate.mockReturnValue(
      aggregation([
        { _id: true, count: 12 },
        { _id: false, count: 3 },
      ]),
    );

    const result = await service.getCustomerReport(new CustomerReportQueryDto());

    expect(result).toEqual({
      totalCustomers: 15,
      activeCustomers: 12,
      inactiveCustomers: 3,
      registrationCount: 15,
      customerOrderCount: 0,
      repeatCustomerCount: 0,
      orderValue: 0,
      currentPaidAmount: 0,
      currentOutstandingBalance: 0,
      customerBreakdown: {
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    });
    expect(customerModel.aggregate).toHaveBeenCalledWith([
      { $group: { _id: '$isActive', count: { $sum: 1 } } },
    ]);
  });

  it('reports customer commercial totals and paginated customer details from order creation dates', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([{ _id: true, count: 2 }]));
    orderModel.aggregate.mockReturnValue(
      aggregation([
        {
          commercialSummary: [
            {
              customerOrderCount: 2,
              repeatCustomerCount: 1,
              orderValue: 350,
              currentPaidAmount: 200,
              currentOutstandingBalance: 150,
            },
          ],
          customerBreakdown: [
            {
              data: [
                {
                  customerId: 'CUS-000001',
                  customerName: 'Asha',
                  orderCount: 2,
                  orderValue: 350,
                  currentPaidAmount: 200,
                  currentOutstandingBalance: 150,
                  latestOrderCreatedAt: new Date('2026-01-03T00:00:00.000Z'),
                },
              ],
              meta: [{ total: 1 }],
            },
          ],
        },
      ]),
    );

    const query = Object.assign(new CustomerReportQueryDto(), {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      customerId: 'CUS-000001',
      page: 2,
      limit: 1,
    });
    const result = await service.getCustomerReport(query);

    expect(result).toMatchObject({
      totalCustomers: 2,
      customerOrderCount: 2,
      repeatCustomerCount: 1,
      orderValue: 350,
      currentPaidAmount: 200,
      currentOutstandingBalance: 150,
      customerBreakdown: {
        data: [{ customerId: 'CUS-000001', customerName: 'Asha', orderValue: 350 }],
        meta: { page: 2, limit: 1, total: 1, totalPages: 1 },
      },
    });

    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    expect(facet.commercialSummary[0]).toEqual({
      $match: {
        createdAt: {
          $gte: new Date('2026-01-01T00:00:00.000Z'),
          $lt: new Date('2026-02-01T00:00:00.000Z'),
        },
      },
    });
    expect(facet.commercialSummary[1]).toEqual({ $match: { customerId: 'CUS-000001' } });
    expect(facet.customerBreakdown.at(-2)).toEqual({ $sort: { orderValue: -1, customerId: 1 } });
    expect(facet.customerBreakdown.at(-1)).toEqual({
      $facet: { data: [{ $skip: 1 }, { $limit: 1 }], meta: [{ $count: 'total' }] },
    });
  });

  it('initializes commercial metrics and preserves registration metrics for empty order results', async () => {
    customerModel.aggregate.mockReturnValue(aggregation([{ _id: false, count: 4 }]));
    orderModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getCustomerReport(new CustomerReportQueryDto());

    expect(result).toMatchObject({
      totalCustomers: 4,
      activeCustomers: 0,
      inactiveCustomers: 4,
      registrationCount: 4,
      customerOrderCount: 0,
      repeatCustomerCount: 0,
      orderValue: 0,
      currentPaidAmount: 0,
      currentOutstandingBalance: 0,
      customerBreakdown: {
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    });
  });

  it('reports order totals and complete status grouping', async () => {
    orderModel.aggregate.mockReturnValue(
      aggregation([
        {
          statusCounts: [
            { _id: OrderStatus.DRAFT, count: 2 },
            { _id: OrderStatus.CONFIRMED, count: 3 },
            { _id: OrderStatus.IN_PROGRESS, count: 4 },
            { _id: OrderStatus.READY, count: 1 },
            { _id: OrderStatus.DELIVERED, count: 6 },
            { _id: OrderStatus.CANCELLED, count: 2 },
          ],
          financial: [
            { orderCount: 18, orderValue: 24000, paidAmount: 15000, outstandingBalance: 9000 },
          ],
          composition: [
            {
              _id: 'TAILORING_ONLY',
              orderCount: 8,
              tailoringAmount: 10000,
              attachedFabricAmount: 1000,
              fabricSaleAmount: 0,
            },
            {
              _id: 'FABRIC_SALE_ONLY',
              orderCount: 5,
              tailoringAmount: 0,
              attachedFabricAmount: 0,
              fabricSaleAmount: 4000,
            },
            {
              _id: 'MIXED',
              orderCount: 5,
              tailoringAmount: 7000,
              attachedFabricAmount: 1500,
              fabricSaleAmount: 1500,
            },
          ],
        },
      ]),
    );

    const result = await service.getOrderReport(new OrderReportQueryDto());

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
      orderCount: 18,
      orderValue: 24000,
      paidAmount: 15000,
      outstandingBalance: 9000,
      composition: {
        tailoringOnly: 8,
        fabricSaleOnly: 5,
        mixed: 5,
        amounts: {
          tailoringAmount: 17000,
          attachedFabricAmount: 2500,
          fabricSaleAmount: 5500,
        },
      },
    });
  });

  it('reports fabric sales by saved snapshot unit and amount', async () => {
    orderModel.aggregate.mockReturnValue(
      aggregation([
        {
          summary: [
            {
              saleCount: 3,
              meterQuantity: 2.5,
              pieceQuantity: 2,
              salesAmount: 450,
              distinctFabricCount: 2,
            },
          ],
          fabricBreakdown: [
            {
              data: [
                {
                  fabricId: 'FAB-000001',
                  name: 'Linen',
                  type: 'COTTON',
                  color: 'Blue',
                  unit: QuantityUnit.METER,
                  totalQuantitySold: 2.5,
                  totalSalesAmount: 250,
                  saleLineCount: 2,
                },
                {
                  fabricId: 'FAB-000002',
                  name: 'Buttons',
                  type: 'ACCESSORIES',
                  color: 'Black',
                  unit: QuantityUnit.PIECE,
                  totalQuantitySold: 2,
                  totalSalesAmount: 200,
                  saleLineCount: 1,
                },
              ],
              meta: [{ total: 2 }],
            },
          ],
        },
      ]),
    );

    const result = await service.getFabricSalesReport(new FabricSalesReportQueryDto());

    expect(result).toEqual({
      saleCount: 3,
      quantitySoldByUnit: { METER: 2.5, PIECE: 2 },
      salesAmount: 450,
      distinctFabricCount: 2,
      fabricBreakdown: {
        data: expect.any(Array),
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      },
    });
    expect(result.fabricBreakdown.data).toHaveLength(2);
  });

  it('filters fabric sales by parent order date and snapshot fabric id', async () => {
    orderModel.aggregate.mockReturnValue(
      aggregation([{ summary: [], fabricBreakdown: [] }]),
    );
    const query = Object.assign(new FabricSalesReportQueryDto(), {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      fabricId: 'FAB-000001',
      page: 2,
      limit: 5,
    });

    await service.getFabricSalesReport(query);

    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({
      $match: {
        createdAt: {
          $gte: new Date('2026-01-01T00:00:00.000Z'),
          $lt: new Date('2026-02-01T00:00:00.000Z'),
        },
      },
    });
    expect(pipeline[3]).toEqual({
      $match: {
        'items.itemType': 'FABRIC_SALE',
        'items.fabricSaleSnapshot.fabricId': 'FAB-000001',
      },
    });
    const facet = pipeline[4].$facet as Record<string, Array<Record<string, unknown>>>;
    expect(JSON.stringify(facet)).toContain('lineTotal');
    expect(JSON.stringify(facet)).toContain('quantitySold');
    expect(JSON.stringify(facet)).not.toContain('pricePerUnit');
  });

  it('initializes empty fabric sales results and excludes legacy/non-sale lines in the pipeline', async () => {
    orderModel.aggregate.mockReturnValue(
      aggregation([{ summary: [], fabricBreakdown: [] }]),
    );

    const result = await service.getFabricSalesReport(new FabricSalesReportQueryDto());

    expect(result).toEqual({
      saleCount: 0,
      quantitySoldByUnit: { METER: 0, PIECE: 0 },
      salesAmount: 0,
      distinctFabricCount: 0,
      fabricBreakdown: {
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    });
    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pipeline[2]).toEqual({ $match: { 'items.itemType': 'FABRIC_SALE' } });
  });

  it('applies date and customer filters to status, financial, and item composition facets', async () => {
    orderModel.aggregate.mockReturnValue(aggregation([{ statusCounts: [], financial: [], composition: [] }]));
    const query = Object.assign(new OrderReportQueryDto(), {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      customerId: 'CUS-000007',
    });

    await service.getOrderReport(query);

    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    const expectedStages = [
      {
        $match: {
          createdAt: {
            $gte: new Date('2026-01-01T00:00:00.000Z'),
            $lt: new Date('2026-02-01T00:00:00.000Z'),
          },
        },
      },
      { $match: { customerId: 'CUS-000007' } },
    ];

    expect(facet.statusCounts.slice(0, 2)).toEqual(expectedStages);
    expect(facet.financial.slice(0, 2)).toEqual(expectedStages);
    expect(facet.composition.slice(0, 2)).toEqual(expectedStages);
  });

  it('returns zero financial and composition values for an empty result while preserving status fields', async () => {
    orderModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getOrderReport(new OrderReportQueryDto());

    expect(result).toEqual({
      totalOrders: 0,
      ordersByStatus: {
        DRAFT: 0,
        CONFIRMED: 0,
        IN_PROGRESS: 0,
        READY: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      },
      orderTotals: { pending: 0, inProgress: 0, completed: 0, cancelled: 0 },
      orderCount: 0,
      orderValue: 0,
      paidAmount: 0,
      outstandingBalance: 0,
      composition: {
        tailoringOnly: 0,
        fabricSaleOnly: 0,
        mixed: 0,
        amounts: { tailoringAmount: 0, attachedFabricAmount: 0, fabricSaleAmount: 0 },
      },
    });
  });

  it('classifies legacy items as tailoring and keeps attached fabric out of fabric-sale amounts', async () => {
    orderModel.aggregate.mockReturnValue(
      aggregation([
        {
          statusCounts: [{ _id: OrderStatus.CONFIRMED, count: 2 }],
          financial: [{ orderCount: 2, orderValue: 1800, paidAmount: 800, outstandingBalance: 1000 }],
          composition: [
            {
              _id: 'TAILORING_ONLY',
              orderCount: 1,
              tailoringAmount: 500,
              attachedFabricAmount: 300,
              fabricSaleAmount: 0,
            },
            {
              _id: 'FABRIC_SALE_ONLY',
              orderCount: 1,
              tailoringAmount: 0,
              attachedFabricAmount: 0,
              fabricSaleAmount: 1000,
            },
          ],
        },
      ]),
    );

    const result = await service.getOrderReport(new OrderReportQueryDto());
    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    const groupStage = facet.composition.find((stage) => '$group' in stage) as Record<string, unknown>;

    expect(result.composition).toEqual({
      tailoringOnly: 1,
      fabricSaleOnly: 1,
      mixed: 0,
      amounts: { tailoringAmount: 500, attachedFabricAmount: 300, fabricSaleAmount: 1000 },
    });
    expect(JSON.stringify(groupStage)).toContain('FABRIC_SALE');
    expect(JSON.stringify(groupStage)).toContain('fabricSnapshot');
    expect(JSON.stringify(groupStage)).toContain('fabricSaleSnapshot');
  });

  it('reports successful and refunded payment activity with method and status counts', async () => {
    paymentModel.aggregate.mockReturnValue(
      aggregation([
        {
          grossCollections: [{ total: 1500 }],
          refunds: [{ total: 300 }],
          byStatus: [
            { _id: PaymentStatus.SUCCESS, count: 2 },
            { _id: PaymentStatus.REFUNDED, count: 1 },
          ],
          byMethod: [
            { _id: PaymentMethod.CASH, count: 1 },
            { _id: PaymentMethod.UPI, count: 2 },
          ],
        },
      ]),
    );

    const result = await service.getPaymentReport(new PaymentReportQueryDto());

    expect(result).toEqual({
      grossCollections: 1500,
      refunds: 300,
      netCollections: 1200,
      paymentCounts: {
        byStatus: { PENDING: 0, SUCCESS: 2, FAILED: 0, REFUNDED: 1 },
        byMethod: { CASH: 1, UPI: 2, CARD: 0, BANK_TRANSFER: 0, OTHER: 0 },
      },
    });
  });

  it('uses paidAt for gross history, refundedAt for refunds, and applies date/customer/method filters', async () => {
    paymentModel.aggregate.mockReturnValue(
      aggregation([{ grossCollections: [], refunds: [], byStatus: [], byMethod: [] }]),
    );
    const query = Object.assign(new PaymentReportQueryDto(), {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      customerId: 'CUS-000007',
      paymentMethod: PaymentMethod.UPI,
    });

    await service.getPaymentReport(query);

    const pipeline = paymentModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    const expectedPaidAt = {
      customerId: 'CUS-000007',
      paymentMethod: PaymentMethod.UPI,
      paidAt: {
        $gte: new Date('2026-01-01T00:00:00.000Z'),
        $lt: new Date('2026-02-01T00:00:00.000Z'),
      },
    };
    const expectedRefundedAt = {
      customerId: 'CUS-000007',
      paymentMethod: PaymentMethod.UPI,
      refundedAt: {
        $gte: new Date('2026-01-01T00:00:00.000Z'),
        $lt: new Date('2026-02-01T00:00:00.000Z'),
      },
    };

    expect(facet.grossCollections[0]).toEqual({
      $match: { ...expectedPaidAt, status: { $in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] } },
    });
    expect(facet.refunds[0]).toEqual({
      $match: { ...expectedRefundedAt, status: PaymentStatus.REFUNDED },
    });
    expect(facet.byStatus[0]).toEqual({ $match: expectedPaidAt });
    expect(facet.byMethod[0]).toEqual({ $match: expectedPaidAt });
  });

  it('uses one exclusive next-day boundary for a single payment calendar day', async () => {
    paymentModel.aggregate.mockReturnValue(
      aggregation([{ grossCollections: [], refunds: [], byStatus: [], byMethod: [] }]),
    );
    const query = Object.assign(new PaymentReportQueryDto(), {
      fromDate: '2026-02-14',
      toDate: '2026-02-14',
    });

    await service.getPaymentReport(query);

    const pipeline = paymentModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    const expectedRange = {
      $gte: new Date('2026-02-14T00:00:00.000Z'),
      $lt: new Date('2026-02-15T00:00:00.000Z'),
    };

    expect(facet.grossCollections[0]).toEqual({
      $match: { paidAt: expectedRange, status: { $in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] } },
    });
    expect(facet.refunds[0]).toEqual({
      $match: { refundedAt: expectedRange, status: PaymentStatus.REFUNDED },
    });
  });

  it('uses one exclusive next-day boundary for multi-day collection and refund ranges', async () => {
    paymentModel.aggregate.mockReturnValue(
      aggregation([{ grossCollections: [], refunds: [], byStatus: [], byMethod: [] }]),
    );
    const query = Object.assign(new PaymentReportQueryDto(), {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    });

    await service.getPaymentReport(query);

    const pipeline = paymentModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    expect(facet.byStatus[0]).toEqual({
      $match: {
        paidAt: {
          $gte: new Date('2026-02-01T00:00:00.000Z'),
          $lt: new Date('2026-03-01T00:00:00.000Z'),
        },
      },
    });
    expect(facet.refunds[0]).toEqual({
      $match: {
        refundedAt: {
          $gte: new Date('2026-02-01T00:00:00.000Z'),
          $lt: new Date('2026-03-01T00:00:00.000Z'),
        },
        status: PaymentStatus.REFUNDED,
      },
    });
  });

  it('returns zeroed payment metrics for an empty result and preserves other reports', async () => {
    paymentModel.aggregate.mockReturnValue(aggregation([]));

    const result = await service.getPaymentReport(new PaymentReportQueryDto());

    expect(result).toEqual({
      grossCollections: 0,
      refunds: 0,
      netCollections: 0,
      paymentCounts: {
        byStatus: { PENDING: 0, SUCCESS: 0, FAILED: 0, REFUNDED: 0 },
        byMethod: { CASH: 0, UPI: 0, CARD: 0, BANK_TRANSFER: 0, OTHER: 0 },
      },
    });
    expect(orderModel.aggregate).not.toHaveBeenCalled();
  });

  it('keeps pending and failed payments out of gross and refund aggregation', async () => {
    paymentModel.aggregate.mockReturnValue(
      aggregation([{ grossCollections: [], refunds: [], byStatus: [], byMethod: [] }]),
    );

    await service.getPaymentReport(new PaymentReportQueryDto());

    const pipeline = paymentModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    expect(facet.grossCollections[0]).toEqual({
      $match: {
        status: { $in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED] },
      },
    });
    expect(facet.refunds[0]).toEqual({
      $match: { status: PaymentStatus.REFUNDED },
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

  it('reports service usage from saved snapshots without multiplying line amounts', async () => {
    orderModel.aggregate.mockReturnValue(
      aggregation([
        {
          summary: [
            { serviceLineCount: 3, distinctServiceCount: 2, serviceAmount: 180 },
          ],
          serviceBreakdown: [
            {
              data: [
                {
                  serviceId: 'SRV-000001',
                  name: 'Premium stitching',
                  totalQuantity: 3,
                  lineCount: 2,
                  serviceAmount: 120,
                },
                {
                  serviceId: 'SRV-000002',
                  name: 'Alteration',
                  totalQuantity: 1,
                  lineCount: 1,
                  serviceAmount: 60,
                },
              ],
              meta: [{ total: 2 }],
            },
          ],
        },
      ]),
    );

    const result = await service.getServiceUsageReport(new ServiceUsageReportQueryDto());

    expect(result).toEqual({
      serviceLineCount: 3,
      distinctServiceCount: 2,
      serviceAmount: 180,
      serviceBreakdown: {
        data: [
          {
            serviceId: 'SRV-000001',
            name: 'Premium stitching',
            totalQuantity: 3,
            lineCount: 2,
            serviceAmount: 120,
          },
          {
            serviceId: 'SRV-000002',
            name: 'Alteration',
            totalQuantity: 1,
            lineCount: 1,
            serviceAmount: 60,
          },
        ],
        meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
      },
    });
    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(JSON.stringify(pipeline)).toContain('lineAmount');
    expect(JSON.stringify(pipeline)).toContain('quantity');
    expect(JSON.stringify(pipeline)).not.toContain('$multiply');
  });

  it('filters service usage by order date and saved service id, excluding fabric sales and missing snapshots', async () => {
    orderModel.aggregate.mockReturnValue(
      aggregation([{ summary: [], serviceBreakdown: [] }]),
    );
    const query = Object.assign(new ServiceUsageReportQueryDto(), {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      serviceId: 'SRV-000001',
      page: 2,
      limit: 5,
    });

    const result = await service.getServiceUsageReport(query);

    expect(result).toEqual({
      serviceLineCount: 0,
      distinctServiceCount: 0,
      serviceAmount: 0,
      serviceBreakdown: {
        data: [],
        meta: { page: 2, limit: 5, total: 0, totalPages: 0 },
      },
    });
    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({
      $match: {
        createdAt: {
          $gte: new Date('2026-02-01T00:00:00.000Z'),
          $lt: new Date('2026-03-01T00:00:00.000Z'),
        },
      },
    });
    expect(pipeline[3]).toEqual({
      $match: {
        'items.itemType': { $ne: 'FABRIC_SALE' },
        'items.serviceSnapshot.serviceId': 'SRV-000001',
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

    if (report === 'order') {
      const pipeline = model.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
      const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
      expect(facet.statusCounts[0]).toEqual({
        $match: {
          [field]: {
            $gte: new Date('2026-01-01T00:00:00.000Z'),
            $lt: new Date('2026-02-01T00:00:00.000Z'),
          },
        },
      });
    } else {
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
    }
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

    const pipeline = orderModel.aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    const facet = pipeline[0].$facet as Record<string, Array<Record<string, unknown>>>;
    expect(facet.statusCounts[0]).toEqual({
      $match: {
        createdAt: { $lt: new Date('2026-02-01T00:00:00.000Z') },
      },
    });
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
