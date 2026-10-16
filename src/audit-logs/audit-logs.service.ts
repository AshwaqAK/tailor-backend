import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';

import { Counter, CounterDocument } from '../users/schemas/counter.schema';
import { AuditLogQueryDto, parseAuditLogDate } from './dto/audit-log-query.dto';
import { AuditAction } from './enums/audit-action.enum';
import { AuditActorType } from './enums/audit-actor-type.enum';
import { AuditEntityType } from './enums/audit-entity-type.enum';
import {
  AuditLog,
  AuditLogDocument,
  sanitizeAuditMetadata,
} from './schemas/audit-log.schema';
import { cursorPredicate, decodeCursor, encodeCursor, withCursorFilter } from '../common/pagination/cursor';

export interface RecordAuditLogInput {
  actorId?: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface PaginatedAuditLogs {
  data: AuditLogDocument[];
  meta: {
    page?: number;
    limit: number;
    total?: number;
    totalPages?: number;
    hasNextPage?: boolean;
    nextCursor?: string | null;
  };
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async record(input: RecordAuditLogInput, session?: ClientSession): Promise<AuditLogDocument> {
    this.validateRecordInput(input);

    let ownedSession: ClientSession | undefined;
    const activeSession = session ?? (ownedSession = await this.connection.startSession());

    try {
      if (!session) activeSession.startTransaction();

      const auditLog = new this.auditLogModel({
        auditId: await this.generateAuditLogId(activeSession),
        actorType: input.actorId ? AuditActorType.USER : AuditActorType.SYSTEM,
        ...(input.actorId ? { actorId: input.actorId } : {}),
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ...(input.metadata
          ? { metadata: sanitizeAuditMetadata(input.metadata) }
          : {}),
      });

      await auditLog.save({ session: activeSession });
      if (!session) await activeSession.commitTransaction();
      return auditLog;
    } catch (error) {
      if (!session && activeSession.inTransaction()) await activeSession.abortTransaction();
      return this.rethrow(error, 'create');
    } finally {
      await ownedSession?.endSession();
    }
  }

  async findAll(query: AuditLogQueryDto): Promise<PaginatedAuditLogs> {
    const { page, cursor, limit = 20 } = query;
    const filter: Record<string, unknown> = {};

    if (query.actorId) filter.actorId = query.actorId;
    if (query.action) filter.action = query.action;
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.fromDate || query.toDate) {
      const eventAt: { $gte?: Date; $lt?: Date } = {};
      if (query.fromDate) eventAt.$gte = parseAuditLogDate(query.fromDate);
      if (query.toDate) {
        const upper = parseAuditLogDate(query.toDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.toDate)) upper.setUTCDate(upper.getUTCDate() + 1);
        eventAt.$lt = upper;
      }
      filter.eventAt = eventAt;
    }

    try {
      if (page === undefined) {
        const decoded = cursor ? decodeCursor(cursor, 'eventAt', 'desc') : undefined;
        const cursorFilter = decoded
          ? withCursorFilter(filter, cursorPredicate('eventAt', 'auditId', 'desc', decoded))
          : filter;
        const fetched = await this.auditLogModel
          .find(cursorFilter)
          .sort({ eventAt: -1, auditId: -1 })
          .limit(limit + 1)
          .exec();
        const hasNextPage = fetched.length > limit;
        const data = hasNextPage ? fetched.slice(0, limit) : fetched;
        const last = data.at(-1);
        return {
          data,
          meta: {
            limit,
            hasNextPage,
            nextCursor: hasNextPage && last ? encodeCursor('eventAt', 'desc', last.eventAt, last.auditId) : null,
          },
        };
      }

      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        this.auditLogModel
          .find(filter)
          .sort({ eventAt: -1, auditId: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.auditLogModel.countDocuments(filter).exec(),
      ]);

      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    } catch (error) {
      this.rethrow(error, 'list');
    }
  }

  async findOne(auditId: string): Promise<AuditLogDocument> {
    if (!/^AUD-\d{6}$/.test(auditId)) {
      throw new BadRequestException('auditLogId must be a valid audit log ID');
    }

    try {
      const auditLog = await this.auditLogModel.findOne({ auditId }).exec();
      if (!auditLog) throw new NotFoundException('Audit log not found');
      return auditLog;
    } catch (error) {
      this.rethrow(error, 'retrieve');
    }
  }

  private validateRecordInput(input: RecordAuditLogInput): void {
    if (!Object.values(AuditAction).includes(input.action)) {
      throw new BadRequestException('Invalid audit action');
    }
    if (!Object.values(AuditEntityType).includes(input.entityType)) {
      throw new BadRequestException('Invalid audit entity type');
    }
    if (!input.entityId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(input.entityId)) {
      throw new BadRequestException('A valid audit entity ID is required');
    }
    if (input.actorId && !/^USR-\d{6}$/.test(input.actorId)) {
      throw new BadRequestException('actorId must be a valid user ID');
    }
    if (input.metadata !== undefined && sanitizeAuditMetadata(input.metadata) === undefined) {
      throw new BadRequestException('metadata must be a structured object');
    }
  }

  private async generateAuditLogId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'audit-log' },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true, session },
      )
      .exec();

    if (!counter) throw new InternalServerErrorException('Failed to generate audit log ID');
    return `AUD-${String(counter.sequence).padStart(6, '0')}`;
  }

  private rethrow(error: unknown, operation: string): never {
    if (error instanceof HttpException) throw error;
    throw new InternalServerErrorException(`Failed to ${operation} audit log`);
  }
}
