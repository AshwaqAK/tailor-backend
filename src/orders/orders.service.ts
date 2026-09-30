import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';

import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { FabricsService } from '../fabrics/fabrics.service';
import type { FabricDocument } from '../fabrics/schemas/fabric.schema';
import { Measurement, MeasurementDocument } from '../measurements/schemas/measurement.schema';
import { ServicesService } from '../services/services.service';
import type { TailoringServiceDocument } from '../services/schemas/tailoring-service.schema';
import { Counter, CounterDocument } from '../users/schemas/counter.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './enums/order-status.enum';
import { OrderItem, OrderItemDocument } from './schemas/order-item.schema';
import { Order, OrderDocument } from './schemas/order.schema';

export interface OrderWithItems {
  order: OrderDocument;
  items: OrderItemDocument[];
}

export type CreateOrderResult = OrderWithItems;

@Injectable()
export class OrdersService {
  private readonly allowedStatusTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
    [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
    [OrderStatus.IN_PROGRESS]: [OrderStatus.READY, OrderStatus.CANCELLED],
    [OrderStatus.READY]: [OrderStatus.DELIVERED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.CANCELLED]: [],
  };

  constructor(
    @InjectConnection()
    private readonly connection: Connection,

    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(OrderItem.name)
    private readonly orderItemModel: Model<OrderItemDocument>,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Measurement.name)
    private readonly measurementModel: Model<MeasurementDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,

    private readonly fabricsService: FabricsService,
    private readonly servicesService: ServicesService,
  ) {}

  async createOrder(createOrderDto: CreateOrderDto, userId: string): Promise<CreateOrderResult> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      if (!createOrderDto.items?.length) {
        throw new BadRequestException('At least one order item is required');
      }

      for (const item of createOrderDto.items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new BadRequestException('Order service quantity must be a positive integer');
        }
      }

      const customerExists = await this.customerModel
        .exists({ customerId: createOrderDto.customerId })
        .session(session)
        .exec();

      if (!customerExists) {
        throw new NotFoundException('Customer not found');
      }

      const serviceIds = createOrderDto.items.flatMap((item) =>
        item.serviceId ? [item.serviceId] : [],
      );
      const tailoringServices = await this.servicesService.findActiveByIds(serviceIds, session);
      const servicesById = new Map<string, TailoringServiceDocument>(
        tailoringServices.map((tailoringService) => [tailoringService.serviceId, tailoringService]),
      );

      const orderId = await this.generateOrderId(session);
      const fabricQuantities = new Map<string, number>();

      for (const item of createOrderDto.items) {
        const hasFabricId = item.fabricId !== undefined;
        const hasFabricQuantity = item.fabricQuantity !== undefined;

        if (hasFabricId !== hasFabricQuantity) {
          throw new BadRequestException('fabricId and fabricQuantity must be provided together');
        }

        if (!item.fabricId || item.fabricQuantity === undefined) {
          continue;
        }

        if (!Number.isFinite(item.fabricQuantity) || item.fabricQuantity <= 0) {
          throw new BadRequestException('Fabric quantity must be positive');
        }

        const currentQuantity = fabricQuantities.get(item.fabricId) ?? 0;
        fabricQuantities.set(item.fabricId, currentQuantity + item.fabricQuantity);
      }

      const fabricsById = new Map<string, FabricDocument>();

      for (const [fabricId, quantity] of fabricQuantities) {
        const fabric = await this.fabricsService.deductStock(
          fabricId,
          quantity,
          orderId,
          userId,
          session,
        );
        fabricsById.set(fabricId, fabric);
      }

      const orderItems: OrderItemDocument[] = [];

      for (const itemDto of createOrderDto.items) {
        const measurement = await this.measurementModel
          .findById(itemDto.measurementId)
          .session(session)
          .exec();

        if (!measurement) {
          throw new NotFoundException('Measurement not found');
        }

        if (measurement.customerId !== createOrderDto.customerId) {
          throw new BadRequestException('Measurement does not belong to the requested customer');
        }

        if (measurement.clothingType !== itemDto.clothingType) {
          throw new BadRequestException(
            'Measurement clothing type does not match the order item clothing type',
          );
        }

        const tailoringService = itemDto.serviceId
          ? servicesById.get(itemDto.serviceId)
          : undefined;
        const serviceLineAmount = tailoringService
          ? this.calculateServiceLineAmount(tailoringService.price, itemDto.quantity)
          : undefined;
        const fabric = itemDto.fabricId ? fabricsById.get(itemDto.fabricId) : undefined;
        const measurementValues = new Map<string, number>(measurement.measurements);
        const orderItem = new this.orderItemModel({
          orderId,
          clothingType: itemDto.clothingType,
          quantity: itemDto.quantity,
          unitPrice: itemDto.unitPrice,
          measurementVersion: measurement.version,
          measurementSnapshot: {
            customerId: measurement.customerId,
            measurementId: measurement._id,
            measurementVersion: measurement.version,
            clothingType: measurement.clothingType,
            measurements: measurementValues,
            fitPreference: measurement.fitPreference,
            notes: measurement.notes,
            measuredAt: new Date(measurement.measuredAt),
          },
          fabricSnapshot:
            fabric && itemDto.fabricQuantity !== undefined
              ? {
                  fabricId: fabric.fabricId,
                  name: fabric.name,
                  type: fabric.type,
                  color: fabric.color,
                  unit: fabric.unit,
                  pricePerUnit: fabric.pricePerUnit,
                  quantityUsed: itemDto.fabricQuantity,
                }
              : undefined,
          serviceSnapshot: tailoringService
            ? {
                serviceId: tailoringService.serviceId,
                name: tailoringService.name,
                price: tailoringService.price,
                quantity: itemDto.quantity,
                lineAmount: serviceLineAmount,
              }
            : undefined,
          notes: itemDto.notes,
        });

        orderItems.push(orderItem);
      }

      const order = new this.orderModel({
        orderId,
        customerId: createOrderDto.customerId,
        orderDate: createOrderDto.orderDate,
        expectedDeliveryDate: createOrderDto.expectedDeliveryDate,
        notes: createOrderDto.notes,
        createdBy: userId,
        updatedBy: userId,
      });

      await order.save({ session });

      for (const orderItem of orderItems) {
        await orderItem.save({ session });
      }

      await session.commitTransaction();

      return {
        order,
        items: orderItems,
      };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      this.rethrowServiceError(error);
    } finally {
      await session.endSession();
    }
  }

  async getOrderByOrderId(orderId: string): Promise<OrderWithItems> {
    const order = await this.orderModel.findOne({ orderId }).exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const items = await this.orderItemModel.find({ orderId }).sort({ createdAt: 1 }).exec();

    return {
      order,
      items,
    };
  }

  async getOrdersByCustomerId(customerId: string): Promise<OrderWithItems[]> {
    const orders = await this.orderModel.find({ customerId }).sort({ createdAt: -1 }).exec();

    if (orders.length === 0) {
      return [];
    }

    const orderIds = orders.map((order) => order.orderId);
    const items = await this.orderItemModel
      .find({
        orderId: {
          $in: orderIds,
        },
      })
      .sort({ createdAt: 1 })
      .exec();

    const itemsByOrderId = new Map<string, OrderItemDocument[]>();

    for (const item of items) {
      const orderItems = itemsByOrderId.get(item.orderId) ?? [];
      orderItems.push(item);
      itemsByOrderId.set(item.orderId, orderItems);
    }

    return orders.map((order) => ({
      order,
      items: itemsByOrderId.get(order.orderId) ?? [],
    }));
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    userId: string,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findOne({ orderId }).exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowedStatuses = this.allowedStatusTransitions[order.status];

    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(
        `Order status cannot transition from ${order.status} to ${status}`,
      );
    }

    order.status = status;
    order.updatedBy = userId;

    return order.save();
  }

  private calculateServiceLineAmount(price: number, quantity: number): number {
    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException('Tailoring service price must be a non-negative number');
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Order service quantity must be a positive integer');
    }

    const lineAmount = price * quantity;

    if (!Number.isFinite(lineAmount) || lineAmount < 0) {
      throw new BadRequestException('Tailoring service line amount must be non-negative');
    }

    return Number(lineAmount.toFixed(2));
  }

  private async generateOrderId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'order' },
        { $inc: { sequence: 1 } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          session,
        },
      )
      .exec();

    if (!counter) {
      throw new InternalServerErrorException('Failed to generate order ID');
    }

    return `ORD-${String(counter.sequence).padStart(6, '0')}`;
  }

  private rethrowServiceError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isDuplicateKeyError(error)) {
      throw new ConflictException('Order ID already exists');
    }

    throw new InternalServerErrorException('Unable to create order');
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
