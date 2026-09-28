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

import { Counter, CounterDocument } from '../users/schemas/counter.schema';
import { CreateFabricDto } from './dto/create-fabric.dto';
import { FabricQueryDto } from './dto/fabric-query.dto';
import { UpdateFabricDto } from './dto/update-fabric.dto';
import { FabricType } from './enums/fabric-type.enum';
import { QuantityUnit } from './enums/quantity-unit.enum';
import { Fabric, FabricDocument } from './schemas/fabric.schema';

export interface PaginatedFabrics {
  data: FabricDocument[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class FabricsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,

    @InjectModel(Fabric.name)
    private readonly fabricModel: Model<FabricDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async create(createFabricDto: CreateFabricDto, userId: string): Promise<FabricDocument> {
    this.validateFabricValues(createFabricDto);

    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const fabricId = await this.generateFabricId(session);
      const fabric = new this.fabricModel({
        ...createFabricDto,
        fabricId,
        createdBy: userId,
        updatedBy: userId,
      });

      await fabric.save({ session });
      await session.commitTransaction();

      return fabric;
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      this.rethrowServiceError(error, 'create');
    } finally {
      await session.endSession();
    }
  }

  async findAll(query: FabricQueryDto): Promise<PaginatedFabrics> {
    const {
      page = 1,
      limit = 20,
      name,
      type,
      color,
      unit,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const filter: Record<string, unknown> = {};

    if (name?.trim()) {
      filter.name = {
        $regex: this.escapeRegex(name.trim()),
        $options: 'i',
      };
    }

    if (type) {
      filter.type = type;
    }

    if (color?.trim()) {
      filter.color = {
        $regex: this.escapeRegex(color.trim()),
        $options: 'i',
      };
    }

    if (unit) {
      filter.unit = unit;
    }

    if (typeof isActive === 'boolean') {
      filter.isActive = isActive;
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    try {
      const [fabrics, total] = await Promise.all([
        this.fabricModel
          .find(filter)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.fabricModel.countDocuments(filter).exec(),
      ]);

      return {
        data: fabrics,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.rethrowServiceError(error, 'list');
    }
  }

  async findOne(fabricId: string): Promise<FabricDocument> {
    try {
      const fabric = await this.fabricModel.findOne({ fabricId }).exec();

      if (!fabric) {
        throw new NotFoundException('Fabric not found');
      }

      return fabric;
    } catch (error) {
      this.rethrowServiceError(error, 'retrieve');
    }
  }

  async deductStock(
    fabricId: string,
    quantity: number,
    orderId: string,
    userId: string,
    session: ClientSession,
  ): Promise<FabricDocument> {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Fabric quantity to deduct must be positive');
    }

    try {
      const fabric = await this.fabricModel
        .findOneAndUpdate(
          {
            fabricId,
            isActive: true,
            quantity: { $gte: quantity },
            stockDeductedOrderIds: { $ne: orderId },
          },
          {
            $inc: { quantity: -quantity },
            $addToSet: { stockDeductedOrderIds: orderId },
            $set: { updatedBy: userId },
          },
          {
            new: true,
            runValidators: true,
            session,
          },
        )
        .exec();

      if (fabric) {
        return fabric;
      }

      const existingFabric = await this.fabricModel
        .findOne({ fabricId })
        .select('+stockDeductedOrderIds')
        .session(session)
        .exec();

      if (!existingFabric) {
        throw new NotFoundException(`Fabric ${fabricId} not found`);
      }

      if (existingFabric.stockDeductedOrderIds.includes(orderId)) {
        return existingFabric;
      }

      if (!existingFabric.isActive) {
        throw new BadRequestException(`Fabric ${fabricId} is inactive`);
      }

      throw new BadRequestException(`Insufficient stock for fabric ${fabricId}`);
    } catch (error) {
      this.rethrowServiceError(error, 'update stock for');
    }
  }

  async update(
    fabricId: string,
    updateFabricDto: UpdateFabricDto,
    userId: string,
  ): Promise<FabricDocument> {
    try {
      this.validateFabricValues(updateFabricDto);

      const fabric = await this.findOne(fabricId);

      if (updateFabricDto.name !== undefined) {
        fabric.name = updateFabricDto.name;
      }

      if (updateFabricDto.type !== undefined) {
        fabric.type = updateFabricDto.type;
      }

      if (updateFabricDto.color !== undefined) {
        fabric.color = updateFabricDto.color;
      }

      if (updateFabricDto.quantity !== undefined) {
        fabric.quantity = updateFabricDto.quantity;
      }

      if (updateFabricDto.unit !== undefined) {
        fabric.unit = updateFabricDto.unit;
      }

      if (updateFabricDto.pricePerUnit !== undefined) {
        fabric.pricePerUnit = updateFabricDto.pricePerUnit;
      }

      if (updateFabricDto.supplier !== undefined) {
        fabric.supplier = updateFabricDto.supplier;
      }

      if (updateFabricDto.description !== undefined) {
        fabric.description = updateFabricDto.description;
      }

      if (updateFabricDto.isActive !== undefined) {
        fabric.isActive = updateFabricDto.isActive;
      }

      fabric.updatedBy = userId;

      return await fabric.save();
    } catch (error) {
      this.rethrowServiceError(error, 'update');
    }
  }

  async remove(fabricId: string): Promise<FabricDocument> {
    try {
      const fabric = await this.fabricModel.findOneAndDelete({ fabricId }).exec();

      if (!fabric) {
        throw new NotFoundException('Fabric not found');
      }

      return fabric;
    } catch (error) {
      this.rethrowServiceError(error, 'remove');
    }
  }

  private async generateFabricId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'fabric' },
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
      throw new InternalServerErrorException('Failed to generate fabric ID');
    }

    return `FAB-${String(counter.sequence).padStart(6, '0')}`;
  }

  private validateFabricValues(values: {
    name?: string;
    type?: FabricType;
    quantity?: number;
    unit?: QuantityUnit;
    pricePerUnit?: number;
  }): void {
    if (
      values.name !== undefined &&
      (typeof values.name !== 'string' || values.name.trim().length === 0)
    ) {
      throw new BadRequestException('Fabric name cannot be empty');
    }

    if (
      values.quantity !== undefined &&
      (!Number.isFinite(values.quantity) || values.quantity < 0)
    ) {
      throw new BadRequestException('Fabric quantity must be a non-negative number');
    }

    if (
      values.pricePerUnit !== undefined &&
      (!Number.isFinite(values.pricePerUnit) || values.pricePerUnit < 0)
    ) {
      throw new BadRequestException('Fabric price per unit must be a non-negative number');
    }

    if (values.type !== undefined && !Object.values(FabricType).includes(values.type)) {
      throw new BadRequestException('Invalid fabric type');
    }

    if (values.unit !== undefined && !Object.values(QuantityUnit).includes(values.unit)) {
      throw new BadRequestException('Invalid fabric quantity unit');
    }
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private rethrowServiceError(error: unknown, action: string): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isDuplicateKeyError(error)) {
      throw new ConflictException('Fabric ID already exists');
    }

    throw new InternalServerErrorException(`Unable to ${action} fabric`);
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
