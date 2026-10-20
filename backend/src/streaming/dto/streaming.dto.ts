import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class DetectViewerBandwidthDto {
  @ApiPropertyOptional({ description: 'Viewer session or connection ID' })
  @IsOptional()
  @IsString()
  viewerSessionId?: string;
}

export class SwitchBitrateTierDto {
  @ApiProperty({ description: 'Target bitrate tier', enum: ['1080p', '720p', '480p', '360p', 'auto'] })
  @IsString()
  tier: string;

  @ApiPropertyOptional({ description: 'Viewer session or connection ID' })
  @IsOptional()
  @IsString()
  viewerSessionId?: string;
}

export class ReportBufferingEventDto {
  @ApiProperty({ description: 'Duration of buffering in milliseconds' })
  @IsInt()
  @Min(0)
  bufferingDurationMs: number;

  @ApiPropertyOptional({ description: 'Viewer session or connection ID' })
  @IsOptional()
  @IsString()
  viewerSessionId?: string;

  @ApiPropertyOptional({ description: 'Current bitrate at time of buffering in kbps' })
  @IsOptional()
  @IsInt()
  @Min(0)
  currentBitrateKbps?: number;
}

export class BandwidthDetectionResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty({ description: 'Estimated viewer bandwidth in kbps' })
  estimatedBandwidthKbps: number;

  @ApiProperty({ description: 'Recommended bitrate tier based on bandwidth', enum: ['1080p', '720p', '480p', '360p'] })
  recommendedTier: string;

  @ApiProperty({ description: 'Recommended bitrate in kbps' })
  recommendedBitrateKbps: number;
}

export class BitrateSwitchResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  previousTier: string;

  @ApiProperty()
  newTier: string;

  @ApiProperty()
  newBitrateKbps: number;

  @ApiProperty()
  switchedAt: Date;
}

export class BufferingEventResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  bufferingDurationMs: number;

  @ApiProperty()
  reportedAt: Date;

  @ApiProperty({ description: 'Updated rebuffer ratio after this event' })
  updatedRebufferRatioPercent: number;
}

export class ManageContentDeliveryDto {
  @ApiProperty({ example: 'https://cdn.lumentix.example' })
  @IsUrl()
  cdnBaseUrl: string;

  @ApiProperty({ example: 'https://stream.lumentix.example/live/event.m3u8' })
  @IsUrl()
  streamUrl: string;

  @ApiPropertyOptional({ example: 'auto', enum: ['auto', '1080p', '720p', '480p'] })
  @IsOptional()
  @IsString()
  qualityProfile?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  adaptiveBitrate?: boolean;
}

export class OptimizeStreamQualityDto {
  @ApiProperty({ example: 4500, description: 'Target bitrate in kbps' })
  @IsInt()
  @Min(500)
  targetBitrateKbps: number;
}

export class StreamDeliveryResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  cdnBaseUrl: string;

  @ApiProperty()
  streamUrl: string;

  @ApiProperty()
  qualityProfile: string;

  @ApiProperty()
  adaptiveBitrate: boolean;

  @ApiProperty()
  targetBitrateKbps: number;

  @ApiProperty()
  playbackUrl: string;
}

export class StreamPerformanceResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  avgBitrateKbps: number;

  @ApiProperty()
  rebufferRatioPercent: number;

  @ApiProperty()
  concurrentViewers: number;

  @ApiProperty()
  qualityScore: number;

  @ApiProperty()
  healthStatus: 'excellent' | 'good' | 'degraded' | 'poor';

  @ApiProperty()
  lastMeasuredAt: Date;
}
