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
import { CreateServiceDto } from './dto/create-service.dto';
import { ServiceQueryDto } from './dto/service-query.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServiceCategory } from './enums/service-category.enum';
import { TailoringService, TailoringServiceDocument } from './schemas/tailoring-service.schema';

export interface PaginatedTailoringServices {
  data: TailoringServiceDocument[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ServicesService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,

    @InjectModel(TailoringService.name)
    private readonly tailoringServiceModel: Model<TailoringServiceDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async create(
    createServiceDto: CreateServiceDto,
    userId: string,
  ): Promise<TailoringServiceDocument> {
    this.validateServiceValues(createServiceDto);

    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const serviceId = await this.generateServiceId(session);
      const tailoringService = new this.tailoringServiceModel({
        ...createServiceDto,
        serviceId,
        createdBy: userId,
        updatedBy: userId,
      });

      await tailoringService.save({ session });
      await session.commitTransaction();

      return tailoringService;
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      this.rethrowServiceError(error, 'create');
    } finally {
      await session.endSession();
    }
  }

  async findAll(query: ServiceQueryDto): Promise<PaginatedTailoringServices> {
    const {
      page = 1,
      limit = 20,
      name,
      category,
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

    if (category) {
      filter.category = category;
    }

    if (typeof isActive === 'boolean') {
      filter.isActive = isActive;
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    try {
      const [tailoringServices, total] = await Promise.all([
        this.tailoringServiceModel
          .find(filter)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.tailoringServiceModel.countDocuments(filter).exec(),
      ]);

      return {
        data: tailoringServices,
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

  async findOne(serviceId: string): Promise<TailoringServiceDocument> {
    try {
      const tailoringService = await this.tailoringServiceModel.findOne({ serviceId }).exec();

      if (!tailoringService) {
        throw new NotFoundException('Tailoring service not found');
      }

      return tailoringService;
    } catch (error) {
      this.rethrowServiceError(error, 'retrieve');
    }
  }

  async findActiveByIds(
    serviceIds: string[],
    session?: ClientSession,
  ): Promise<TailoringServiceDocument[]> {
    const uniqueServiceIds = [...new Set(serviceIds)];

    if (uniqueServiceIds.length === 0) {
      return [];
    }

    try {
      const query = this.tailoringServiceModel.find({
        serviceId: { $in: uniqueServiceIds },
      });

      if (session) {
        query.session(session);
      }

      const tailoringServices = await query.exec();
      const servicesById = new Map(
        tailoringServices.map((tailoringService) => [tailoringService.serviceId, tailoringService]),
      );

      for (const serviceId of uniqueServiceIds) {
        const tailoringService = servicesById.get(serviceId);

        if (!tailoringService) {
          throw new NotFoundException(`Tailoring service ${serviceId} not found`);
        }

        if (!tailoringService.isActive) {
          throw new BadRequestException(`Tailoring service ${serviceId} is inactive`);
        }
      }

      return uniqueServiceIds.map((serviceId) => servicesById.get(serviceId)!);
    } catch (error) {
      this.rethrowServiceError(error, 'retrieve');
    }
  }

  async update(
    serviceId: string,
    updateServiceDto: UpdateServiceDto,
    userId: string,
  ): Promise<TailoringServiceDocument> {
    try {
      this.validateServiceValues(updateServiceDto);

      const tailoringService = await this.findOne(serviceId);

      if (updateServiceDto.name !== undefined) {
        tailoringService.name = updateServiceDto.name;
      }

      if (updateServiceDto.category !== undefined) {
        tailoringService.category = updateServiceDto.category;
      }

      if (updateServiceDto.price !== undefined) {
        tailoringService.price = updateServiceDto.price;
      }

      if (updateServiceDto.description !== undefined) {
        tailoringService.description = updateServiceDto.description;
      }

      if (updateServiceDto.isActive !== undefined) {
        tailoringService.isActive = updateServiceDto.isActive;
      }

      tailoringService.updatedBy = userId;

      return await tailoringService.save();
    } catch (error) {
      this.rethrowServiceError(error, 'update');
    }
  }

  async remove(serviceId: string): Promise<TailoringServiceDocument> {
    try {
      const tailoringService = await this.tailoringServiceModel
        .findOneAndDelete({ serviceId })
        .exec();

      if (!tailoringService) {
        throw new NotFoundException('Tailoring service not found');
      }

      return tailoringService;
    } catch (error) {
      this.rethrowServiceError(error, 'remove');
    }
  }

  private async generateServiceId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'service' },
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
      throw new InternalServerErrorException('Failed to generate tailoring service ID');
    }

    return `SRV-${String(counter.sequence).padStart(6, '0')}`;
  }

  private validateServiceValues(values: {
    name?: string;
    category?: ServiceCategory;
    price?: number;
  }): void {
    if (
      values.name !== undefined &&
      (typeof values.name !== 'string' || values.name.trim().length === 0)
    ) {
      throw new BadRequestException('Tailoring service name cannot be empty');
    }

    if (values.price !== undefined && (!Number.isFinite(values.price) || values.price < 0)) {
      throw new BadRequestException('Tailoring service price must be a non-negative number');
    }

    if (
      values.category !== undefined &&
      !Object.values(ServiceCategory).includes(values.category)
    ) {
      throw new BadRequestException('Invalid tailoring service category');
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
      throw new ConflictException('Tailoring service ID already exists');
    }

    throw new InternalServerErrorException(`Unable to ${action} tailoring service`);
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
