import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role, Roles } from '../common/decorators/roles.decorator';
import { VenueCapacityService } from './venue-capacity.service';
import {
  IncrementAttendanceCounterDto,
  IncrementCounterResponseDto,
  RejectOverCapacityResponseDto,
  SetVenueCapacityDto,
  VenueCapacitySetResponseDto,
  VenueCapacityStatusDto,
} from './dto/venue-capacity.dto';

/**
 * VenueCapacityController
 *
 * Exposes REST endpoints that mirror the on-chain venue capacity enforcement
 * contract (`contract/src/venue_capacity.rs`).
 *
 * All write operations require the `organizer` role; read operations (status
 * and reject-check) are accessible to any authenticated user.
 */
@ApiTags('Venue Capacity')
@ApiBearerAuth()
@Controller('venue-capacity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenueCapacityController {
  constructor(private readonly venueCapacityService: VenueCapacityService) {}

  /**
   * POST /venue-capacity/set
   *
   * Set or update the maximum capacity for an event.
   * Mirrors the on-chain `set_venue_capacity(env, event_id, max_capacity)`.
   */
  @Post('set')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({
    summary: 'Set venue capacity for an event',
    description:
      'Configures the maximum number of attendees for an event. ' +
      'Mirrors the on-chain set_venue_capacity entrypoint. ' +
      'Requires ORGANIZER or ADMIN role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Capacity set successfully',
    type: VenueCapacitySetResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid capacity value' })
  @ApiResponse({ status: 409, description: 'Capacity would be below current count' })
  setVenueCapacity(
    @Body() dto: SetVenueCapacityDto,
  ): VenueCapacitySetResponseDto {
    return this.venueCapacityService.setVenueCapacity(
      dto.eventId,
      dto.maxCapacity,
    );
  }

  /**
   * POST /venue-capacity/increment
   *
   * Increment the attendance counter for an event (called during ticket mint).
   * Returns 409 when the venue is already at capacity.
   * Mirrors the on-chain `increment_attendance_counter(env, event_id)`.
   */
  @Post('increment')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({
    summary: 'Increment the on-chain attendance counter',
    description:
      'Atomically increments the real-time attendance counter. ' +
      'Returns HTTP 409 when the venue is already at or over capacity, ' +
      'preventing further ticket minting. ' +
      'Mirrors the on-chain increment_attendance_counter entrypoint.',
  })
  @ApiResponse({
    status: 201,
    description: 'Counter incremented successfully',
    type: IncrementCounterResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Capacity not configured for this event' })
  @ApiResponse({ status: 409, description: 'Venue is at capacity — mint rejected' })
  incrementAttendanceCounter(
    @Body() dto: IncrementAttendanceCounterDto,
  ): IncrementCounterResponseDto {
    return this.venueCapacityService.incrementAttendanceCounter(dto.eventId);
  }

  /**
   * GET /venue-capacity/:eventId/reject-check
   *
   * Read-only capacity gate check.  Returns `shouldReject: true` when the
   * venue is at or over capacity and any new mint should be rejected.
   * Mirrors the on-chain `reject_over_capacity_mint(env, event_id) -> bool`.
   */
  @Get(':eventId/reject-check')
  @ApiOperation({
    summary: 'Check whether a ticket mint should be rejected due to capacity',
    description:
      'Returns shouldReject=true when the event is at or over its configured ' +
      'maximum capacity. Returns shouldReject=false if no capacity limit has ' +
      'been set (unlimited). ' +
      'Mirrors the on-chain reject_over_capacity_mint entrypoint.',
  })
  @ApiParam({ name: 'eventId', description: 'The on-chain event identifier' })
  @ApiResponse({
    status: 200,
    description: 'Capacity gate check result',
    type: RejectOverCapacityResponseDto,
  })
  rejectOverCapacityMint(
    @Param('eventId') eventId: string,
  ): RejectOverCapacityResponseDto {
    return this.venueCapacityService.rejectOverCapacityMint(eventId);
  }

  /**
   * GET /venue-capacity/:eventId/status
   *
   * Full capacity status for an event including current count, limit, and
   * remaining slots.
   */
  @Get(':eventId/status')
  @ApiOperation({
    summary: 'Get full venue capacity status for an event',
    description:
      'Returns the current attendance count, maximum capacity, remaining ' +
      'slots, and whether the venue is at capacity.',
  })
  @ApiParam({ name: 'eventId', description: 'The on-chain event identifier' })
  @ApiResponse({
    status: 200,
    description: 'Venue capacity status',
    type: VenueCapacityStatusDto,
  })
  @ApiResponse({ status: 404, description: 'Capacity not configured for this event' })
  getCapacityStatus(
    @Param('eventId') eventId: string,
  ): VenueCapacityStatusDto {
    return this.venueCapacityService.getCapacityStatus(eventId);
  }
}
