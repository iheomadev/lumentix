import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class SetVenueCapacityDto {
  @ApiProperty({ description: 'Unique identifier of the event on-chain' })
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({
    description: 'Maximum number of attendees allowed for this event',
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  maxCapacity: number;
}

export class IncrementAttendanceCounterDto {
  @ApiProperty({ description: 'Unique identifier of the event on-chain' })
  @IsString()
  @IsNotEmpty()
  eventId: string;
}

export class VenueCapacityStatusDto {
  @ApiProperty({ description: 'Unique identifier of the event on-chain' })
  eventId: string;

  @ApiProperty({ description: 'Configured maximum capacity (0 = unlimited)' })
  maxCapacity: number;

  @ApiProperty({ description: 'Current attendance counter value' })
  currentCount: number;

  @ApiProperty({ description: 'Whether new ticket mints should be rejected' })
  isAtCapacity: boolean;

  @ApiProperty({ description: 'Remaining available slots' })
  remainingSlots: number;
}

export class VenueCapacitySetResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  maxCapacity: number;

  @ApiProperty()
  message: string;
}

export class IncrementCounterResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  newCount: number;

  @ApiProperty()
  remainingSlots: number;

  @ApiProperty()
  message: string;
}

export class RejectOverCapacityResponseDto {
  @ApiProperty({ description: 'The event id that was checked' })
  eventId: string;

  @ApiProperty({
    description:
      'True if the event is at or over capacity and minting should be rejected',
  })
  shouldReject: boolean;

  @ApiProperty({ description: 'Human-readable status message' })
  reason: string;
}
