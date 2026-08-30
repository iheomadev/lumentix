import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IncrementCounterResponseDto,
  RejectOverCapacityResponseDto,
  VenueCapacitySetResponseDto,
  VenueCapacityStatusDto,
} from './dto/venue-capacity.dto';

/**
 * In-memory record representing capacity configuration for a single event.
 */
interface CapacityRecord {
  maxCapacity: number;
  currentCount: number;
}

/**
 * VenueCapacityService
 *
 * Mirrors the on-chain venue capacity enforcement contract
 * (`contract/src/venue_capacity.rs`).  The service acts as the authoritative
 * backend layer that tracks per-event capacity state and enforces the same
 * invariants described in the Soroban contract:
 *
 *  - `setVenueCapacity`          → set or update the max-attendee limit
 *  - `incrementAttendanceCounter` → atomically increment and reject if full
 *  - `rejectOverCapacityMint`    → read-only check; true = reject mint
 *
 * Storage is kept in a plain `Map` so no new DB entity is required.
 */
@Injectable()
export class VenueCapacityService {
  private readonly logger = new Logger(VenueCapacityService.name);

  /** In-memory store: eventId → capacity record */
  private readonly store = new Map<string, CapacityRecord>();

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  /**
   * Set (or update) the maximum capacity for an event.
   *
   * Mirrors the on-chain `set_venue_capacity(env, event_id, max_capacity)`.
   */
  setVenueCapacity(
    eventId: string,
    maxCapacity: number,
  ): VenueCapacitySetResponseDto {
    if (maxCapacity < 1) {
      throw new BadRequestException('maxCapacity must be at least 1');
    }

    const existing = this.store.get(eventId);
    if (existing) {
      // Guard: don't allow shrinking capacity below the current count.
      if (maxCapacity < existing.currentCount) {
        throw new ConflictException(
          `Cannot reduce capacity to ${maxCapacity}; current attendance count is ${existing.currentCount}`,
        );
      }
      existing.maxCapacity = maxCapacity;
      this.logger.log(
        `Updated venue capacity for event "${eventId}" to ${maxCapacity}`,
      );
    } else {
      this.store.set(eventId, { maxCapacity, currentCount: 0 });
      this.logger.log(
        `Set venue capacity for event "${eventId}" to ${maxCapacity}`,
      );
    }

    return {
      eventId,
      maxCapacity,
      message: `Venue capacity for event "${eventId}" set to ${maxCapacity}`,
    };
  }

  /**
   * Increment the on-chain attendance counter for an event.
   *
   * Throws `ConflictException` (HTTP 409) when the venue is already at or over
   * capacity — mirroring the on-chain `panic!("venue at capacity")`.
   *
   * Mirrors `increment_attendance_counter(env, event_id)`.
   */
  incrementAttendanceCounter(eventId: string): IncrementCounterResponseDto {
    const record = this.requireRecord(eventId);

    if (record.currentCount >= record.maxCapacity) {
      this.logger.warn(
        `Attendance increment rejected for event "${eventId}" — venue at capacity (${record.currentCount}/${record.maxCapacity})`,
      );
      throw new ConflictException(
        `Event "${eventId}" is at capacity (${record.maxCapacity}/${record.maxCapacity}). No further tickets can be issued.`,
      );
    }

    record.currentCount += 1;
    const remainingSlots = record.maxCapacity - record.currentCount;

    this.logger.log(
      `Attendance counter incremented for event "${eventId}": ${record.currentCount}/${record.maxCapacity}`,
    );

    return {
      eventId,
      newCount: record.currentCount,
      remainingSlots,
      message: `Attendance counter incremented. ${remainingSlots} slot(s) remaining.`,
    };
  }

  /**
   * Determine whether a new ticket mint should be rejected due to capacity.
   *
   * Returns `{ shouldReject: true }` when the event is at or over its limit.
   * Returns `{ shouldReject: false }` when capacity has not been configured
   * (treat as unlimited, consistent with the on-chain contract).
   *
   * Mirrors `reject_over_capacity_mint(env, event_id) -> bool`.
   */
  rejectOverCapacityMint(eventId: string): RejectOverCapacityResponseDto {
    const record = this.store.get(eventId);

    if (!record) {
      return {
        eventId,
        shouldReject: false,
        reason: 'No capacity limit configured for this event; minting is allowed.',
      };
    }

    const shouldReject = record.currentCount >= record.maxCapacity;
    return {
      eventId,
      shouldReject,
      reason: shouldReject
        ? `Event "${eventId}" is at capacity (${record.currentCount}/${record.maxCapacity}). Mint rejected.`
        : `Event "${eventId}" has capacity available (${record.currentCount}/${record.maxCapacity}). Mint allowed.`,
    };
  }

  /**
   * Read the full capacity status for an event (utility method used by the
   * controller's status endpoint).
   */
  getCapacityStatus(eventId: string): VenueCapacityStatusDto {
    const record = this.requireRecord(eventId);
    const isAtCapacity = record.currentCount >= record.maxCapacity;

    return {
      eventId,
      maxCapacity: record.maxCapacity,
      currentCount: record.currentCount,
      isAtCapacity,
      remainingSlots: Math.max(0, record.maxCapacity - record.currentCount),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private requireRecord(eventId: string): CapacityRecord {
    const record = this.store.get(eventId);
    if (!record) {
      throw new NotFoundException(
        `Venue capacity has not been configured for event "${eventId}". Call POST /venue-capacity/set first.`,
      );
    }
    return record;
  }
}
