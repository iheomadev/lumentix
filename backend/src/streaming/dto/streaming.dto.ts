import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
} from 'class-validator';

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

// ─── Adaptive Bitrate Streaming DTOs ────────────────────────────────────────

export class DetectViewerBandwidthDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Viewer UUID' })
  @IsUUID()
  viewerId: string;

  @ApiPropertyOptional({ example: 5000, description: 'Measurement window in milliseconds', minimum: 1000, default: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  sampleWindowMs?: number;

  @ApiProperty({ example: 2621440, description: 'Bytes transferred within the sample window' })
  @IsInt()
  @Min(0)
  uploadedBytes: number;
}

export class DetectViewerBandwidthResponseDto {
  @ApiProperty()
  viewerId: string;

  @ApiProperty({ description: 'Estimated bandwidth in kbps' })
  estimatedBandwidthKbps: number;

  @ApiProperty({ enum: ['1080p', '720p', '480p', '240p'], description: 'Recommended quality profile' })
  recommendedProfile: string;

  @ApiProperty()
  timestamp: Date;
}

export class SwitchBitrateTierDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  viewerId: string;

  @ApiProperty({ enum: ['auto', '1080p', '720p', '480p', '240p'], example: '720p' })
  @IsIn(['auto', '1080p', '720p', '480p', '240p'])
  targetProfile: string;

  @ApiProperty({ enum: ['manual', 'auto', 'buffering'], example: 'manual' })
  @IsIn(['manual', 'auto', 'buffering'])
  reason: string;
}

export class SwitchBitrateTierResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  viewerId: string;

  @ApiProperty()
  previousProfile: string;

  @ApiProperty()
  newProfile: string;

  @ApiProperty({ description: 'Updated HLS playback URL for the selected quality tier' })
  playbackUrl: string;
}

export class ReportBufferingEventDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  viewerId: string;

  @ApiProperty({ example: 4500, description: 'How long buffering lasted in milliseconds' })
  @IsInt()
  @Min(0)
  bufferingDurationMs: number;

  @ApiProperty({ example: '720p', description: 'Quality profile active during buffering' })
  @IsString()
  currentProfile: string;

  @ApiPropertyOptional({ example: 'wifi', description: "Network type, e.g. '4g', 'wifi', 'unknown'" })
  @IsOptional()
  @IsString()
  networkType?: string;
}

export class ReportBufferingResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  viewerId: string;

  @ApiProperty({ enum: ['downgraded', 'maintained', 'upgraded'] })
  action: string;

  @ApiProperty()
  newProfile: string;

  @ApiProperty()
  message: string;
}
